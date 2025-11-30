<template>
  <div class="app-shell">
    <aside class="sidebar">
      <header>
        <h1>LDR 智能体</h1>
        <button class="ghost" @click="startNewConversation" :disabled="loading">
          新会话
        </button>
      </header>
      <ul class="conversation-list">
        <li
          v-for="conversation in conversations"
          :key="conversation.id"
          :class="{ active: conversation.id === activeConversationId }"
          @click="selectConversation(conversation.id)"
        >
          <p class="title">{{ conversation.title }}</p>
          <p class="timestamp">
            {{ new Date(conversation.createdAt).toLocaleString() }}
          </p>
        </li>
      </ul>
    </aside>

    <main class="chat-panel">
      <section class="messages" ref="messagePane">
        <article
          v-for="message in activeConversation?.messages ?? []"
          :key="message.id"
          :class="['message', message.role]"
        >
          <header>
            <span class="role">{{
              roleLabels[message.role] ?? message.role
            }}</span>
            <time>{{ new Date(message.createdAt).toLocaleTimeString() }}</time>
          </header>
          <p>{{ message.content }}</p>
        </article>
        <p v-if="loading" class="typing">智能体思考中...</p>
      </section>

      <footer class="composer">
        <textarea
          v-model="userInput"
          placeholder="输入你的问题..."
          rows="3"
          :disabled="loading"
          @keydown.enter.prevent="maybeSend"
        />
        <div class="actions">
          <span class="error" v-if="error">{{ error }}</span>
          <button
            @click="handleSend"
            :disabled="loading || userInput.trim().length === 0"
          >
            发送
          </button>
        </div>
      </footer>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";

import type { Conversation } from "./types/chat";
import {
  createConversation,
  fetchConversation,
  listConversations,
  sendMessageStream,
  getStoredConversationId,
  setStoredConversationId,
} from "./services/api";

const conversations = ref<Conversation[]>([]);
const activeConversationId = ref<string>("");
const loading = ref(false);
const error = ref("");
const userInput = ref("");
const messagePane = ref<HTMLElement | null>(null);
const streamingMessageId = ref<string | null>(null);
const pendingUserMessageId = ref<string | null>(null);
const streamController = ref<AbortController | null>(null);

const roleLabels: Record<string, string> = {
  user: "你",
  assistant: "智能体",
  system: "系统",
  tool: "工具",
};

const activeConversation = computed<Conversation | undefined>(() =>
  conversations.value.find(
    (conversation: Conversation) =>
      conversation.id === activeConversationId.value
  )
);

const scrollToBottom = async () => {
  await nextTick();
  if (messagePane.value) {
    messagePane.value.scrollTop = messagePane.value.scrollHeight;
  }
};

const bootstrapConversation = async () => {
  try {
    const storedId = getStoredConversationId();
    if (!storedId) {
      const conversation = await createConversation();
      conversations.value = [conversation];
      activeConversationId.value = conversation.id;
      return;
    }
    const conversation = await fetchConversation(storedId);
    conversations.value = [conversation];
    activeConversationId.value = conversation.id;
  } catch (err) {
    console.error(err);
    const conversation = await createConversation();
    conversations.value = [conversation];
    activeConversationId.value = conversation.id;
  }
};

const refreshConversationList = async () => {
  conversations.value = await listConversations();
  if (!activeConversationId.value && conversations.value.length) {
    activeConversationId.value = conversations.value[0].id;
  }
};

const selectConversation = async (id: string) => {
  if (id === activeConversationId.value) {
    return;
  }
  try {
    const conversation = await fetchConversation(id);
    const others = conversations.value.filter((c: Conversation) => c.id !== id);
    conversations.value = [conversation, ...others];
    activeConversationId.value = id;
    setStoredConversationId(id);
  } catch (err) {
    console.error(err);
    error.value = "无法加载会话";
  }
};

const startNewConversation = async () => {
  loading.value = true;
  error.value = "";
  try {
    const conversation = await createConversation();
    await refreshConversationList();
    activeConversationId.value = conversation.id;
  } catch (err) {
    console.error(err);
    error.value = "创建会话失败";
  } finally {
    loading.value = false;
  }
};

const ensureActiveConversation = async () => {
  if (activeConversationId.value) {
    return;
  }
  const conversation = await createConversation();
  conversations.value = [conversation, ...conversations.value];
  activeConversationId.value = conversation.id;
};

const findConversation = (id: string) =>
  conversations.value.find((conversation) => conversation.id === id);

const appendLocalMessage = (
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  id: string
) => {
  const conversation = findConversation(conversationId);
  if (!conversation) {
    return;
  }
  conversation.messages.push({
    id,
    role,
    content,
    createdAt: new Date().toISOString(),
  });
};

const updateLocalMessage = (
  conversationId: string,
  id: string,
  updater: (previous: string) => string
) => {
  const conversation = findConversation(conversationId);
  if (!conversation) {
    return;
  }
  const message = conversation.messages.find((msg) => msg.id === id);
  if (!message) {
    return;
  }
  message.content = updater(message.content);
};

const removeLocalMessage = (conversationId: string, id: string | null) => {
  if (!id) {
    return;
  }
  const conversation = findConversation(conversationId);
  if (!conversation) {
    return;
  }
  const index = conversation.messages.findIndex((msg) => msg.id === id);
  if (index >= 0) {
    conversation.messages.splice(index, 1);
  }
};

const upsertConversation = (conversation: Conversation) => {
  const others = conversations.value.filter((c) => c.id !== conversation.id);
  conversations.value = [conversation, ...others];
  activeConversationId.value = conversation.id;
  setStoredConversationId(conversation.id);
};

const cleanupPlaceholders = (conversationId: string) => {
  removeLocalMessage(conversationId, pendingUserMessageId.value);
  removeLocalMessage(conversationId, streamingMessageId.value);
  pendingUserMessageId.value = null;
  streamingMessageId.value = null;
};

const handleSend = async () => {
  if (userInput.value.trim().length === 0) {
    return;
  }
  await ensureActiveConversation();
  if (!activeConversationId.value) {
    error.value = "请先创建会话";
    return;
  }
  loading.value = true;
  error.value = "";
  const message = userInput.value.trim();
  userInput.value = "";
  const conversationId = activeConversationId.value;
  const controller = new AbortController();
  streamController.value = controller;
  pendingUserMessageId.value = `local-user-${Date.now()}`;
  streamingMessageId.value = `local-assistant-${Date.now()}`;
  appendLocalMessage(
    conversationId,
    "user",
    message,
    pendingUserMessageId.value
  );
  appendLocalMessage(conversationId, "assistant", "", streamingMessageId.value);
  await scrollToBottom();
  try {
    await sendMessageStream(conversationId, message, {
      signal: controller.signal,
      onProgress: (delta) => {
        if (!streamingMessageId.value || !delta) {
          return;
        }
        updateLocalMessage(
          conversationId,
          streamingMessageId.value,
          (prev) => `${prev}${delta}`
        );
        scrollToBottom();
      },
      onDone: (conversation) => {
        upsertConversation(conversation);
        pendingUserMessageId.value = null;
        streamingMessageId.value = null;
      },
      onError: (message) => {
        error.value = message;
      },
    });
  } catch (err) {
    console.error(err);
    error.value = "发送失败，请稍后重试";
  } finally {
    cleanupPlaceholders(conversationId);
    loading.value = false;
    streamController.value = null;
  }
};

const maybeSend = (event: KeyboardEvent) => {
  if (event.shiftKey) {
    userInput.value += "\n";
    return;
  }
  event.preventDefault();
  handleSend();
};

watch(
  () => activeConversation?.value?.messages.length,
  () => {
    scrollToBottom();
  }
);

onMounted(async () => {
  await bootstrapConversation();
  await refreshConversationList();
});
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100vh;
  color: #f8fafc;
}

.sidebar {
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(8px);
  border-right: 1px solid rgba(226, 232, 240, 0.08);
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.sidebar header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.sidebar h1 {
  font-size: 1.1rem;
  margin: 0;
}

.ghost {
  background: transparent;
  border: 1px solid rgba(248, 250, 252, 0.3);
  color: inherit;
  padding: 0.25rem 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
}

.conversation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  overflow-y: auto;
}

.conversation-list li {
  padding: 0.75rem;
  border-radius: 0.75rem;
  cursor: pointer;
  margin-bottom: 0.5rem;
  background: rgba(148, 163, 184, 0.08);
}

.conversation-list li.active {
  background: rgba(59, 130, 246, 0.2);
}

.conversation-list .title {
  margin: 0 0 0.25rem;
  font-weight: 600;
}

.conversation-list .timestamp {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
}

.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  padding: 1rem;
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.08);
}

.message.user {
  align-self: flex-end;
  background: rgba(59, 130, 246, 0.15);
}

.message header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.typing {
  font-style: italic;
  color: #94a3b8;
}

.composer {
  border-top: 1px solid rgba(226, 232, 240, 0.08);
  padding: 1rem 1.5rem;
  background: rgba(2, 6, 23, 0.8);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

textarea {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 0.75rem;
  font-size: 1rem;
  resize: none;
  background: rgba(15, 23, 42, 0.6);
  color: inherit;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

button {
  background: #2563eb;
  color: #f8fafc;
  border: none;
  padding: 0.6rem 1.5rem;
  border-radius: 999px;
  font-size: 0.95rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #f87171;
  font-size: 0.9rem;
}

@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
  }
  .sidebar {
    display: none;
  }
}
</style>
