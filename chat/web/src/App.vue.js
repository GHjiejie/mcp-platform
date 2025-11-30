import { computed, nextTick, onMounted, ref, watch } from "vue";
import { createConversation, fetchConversation, listConversations, sendMessageStream, getStoredConversationId, setStoredConversationId, } from "./services/api";
const conversations = ref([]);
const activeConversationId = ref("");
const loading = ref(false);
const error = ref("");
const userInput = ref("");
const messagePane = ref(null);
const streamingMessageId = ref(null);
const pendingUserMessageId = ref(null);
const streamController = ref(null);
const roleLabels = {
    user: "你",
    assistant: "智能体",
    system: "系统",
    tool: "工具",
};
const activeConversation = computed(() => conversations.value.find((conversation) => conversation.id === activeConversationId.value));
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
    }
    catch (err) {
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
const selectConversation = async (id) => {
    if (id === activeConversationId.value) {
        return;
    }
    try {
        const conversation = await fetchConversation(id);
        const others = conversations.value.filter((c) => c.id !== id);
        conversations.value = [conversation, ...others];
        activeConversationId.value = id;
        setStoredConversationId(id);
    }
    catch (err) {
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
    }
    catch (err) {
        console.error(err);
        error.value = "创建会话失败";
    }
    finally {
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
const findConversation = (id) => conversations.value.find((conversation) => conversation.id === id);
const appendLocalMessage = (conversationId, role, content, id) => {
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
const updateLocalMessage = (conversationId, id, updater) => {
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
const removeLocalMessage = (conversationId, id) => {
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
const upsertConversation = (conversation) => {
    const others = conversations.value.filter((c) => c.id !== conversation.id);
    conversations.value = [conversation, ...others];
    activeConversationId.value = conversation.id;
    setStoredConversationId(conversation.id);
};
const cleanupPlaceholders = (conversationId) => {
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
    appendLocalMessage(conversationId, "user", message, pendingUserMessageId.value);
    appendLocalMessage(conversationId, "assistant", "", streamingMessageId.value);
    await scrollToBottom();
    try {
        await sendMessageStream(conversationId, message, {
            signal: controller.signal,
            onProgress: (delta) => {
                if (!streamingMessageId.value || !delta) {
                    return;
                }
                updateLocalMessage(conversationId, streamingMessageId.value, (prev) => `${prev}${delta}`);
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
    }
    catch (err) {
        console.error(err);
        error.value = "发送失败，请稍后重试";
    }
    finally {
        cleanupPlaceholders(conversationId);
        loading.value = false;
        streamController.value = null;
    }
};
const maybeSend = (event) => {
    if (event.shiftKey) {
        userInput.value += "\n";
        return;
    }
    event.preventDefault();
    handleSend();
};
watch(() => activeConversation?.value?.messages.length, () => {
    scrollToBottom();
});
onMounted(async () => {
    await bootstrapConversation();
    await refreshConversationList();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['message']} */ ;
/** @type {__VLS_StyleScopedClasses['message']} */ ;
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "sidebar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.startNewConversation) },
    ...{ class: "ghost" },
    disabled: (__VLS_ctx.loading),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "conversation-list" },
});
for (const [conversation] of __VLS_getVForSourceType((__VLS_ctx.conversations))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectConversation(conversation.id);
            } },
        key: (conversation.id),
        ...{ class: ({ active: conversation.id === __VLS_ctx.activeConversationId }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "title" },
    });
    (conversation.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "timestamp" },
    });
    (new Date(conversation.createdAt).toLocaleString());
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "chat-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "messages" },
    ref: "messagePane",
});
/** @type {typeof __VLS_ctx.messagePane} */ ;
for (const [message] of __VLS_getVForSourceType((__VLS_ctx.activeConversation?.messages ?? []))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (message.id),
        ...{ class: (['message', message.role]) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "role" },
    });
    (__VLS_ctx.roleLabels[message.role] ?? message.role);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.time, __VLS_intrinsicElements.time)({});
    (new Date(message.createdAt).toLocaleTimeString());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (message.content);
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "typing" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "composer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
    ...{ onKeydown: (__VLS_ctx.maybeSend) },
    value: (__VLS_ctx.userInput),
    placeholder: "输入你的问题...",
    rows: "3",
    disabled: (__VLS_ctx.loading),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "actions" },
});
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "error" },
    });
    (__VLS_ctx.error);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleSend) },
    disabled: (__VLS_ctx.loading || __VLS_ctx.userInput.trim().length === 0),
});
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['timestamp']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['messages']} */ ;
/** @type {__VLS_StyleScopedClasses['role']} */ ;
/** @type {__VLS_StyleScopedClasses['typing']} */ ;
/** @type {__VLS_StyleScopedClasses['composer']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            conversations: conversations,
            activeConversationId: activeConversationId,
            loading: loading,
            error: error,
            userInput: userInput,
            messagePane: messagePane,
            roleLabels: roleLabels,
            activeConversation: activeConversation,
            selectConversation: selectConversation,
            startNewConversation: startNewConversation,
            handleSend: handleSend,
            maybeSend: maybeSend,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
