import { McpHttpClient, type ClientConfig } from "mcp-client/lib";

import { config } from "../config/env";
import {
  ConversationStore,
  type Conversation,
  type Message,
} from "./conversationStore";

type ToolCallResult = {
  [key: string]: unknown;
  content?: Array<{ type: string; text?: string }>;
  toolResult?: unknown;
};

const isTextBlock = (
  block: unknown
): block is { type: string; text: string } => {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: string }).type === "text" &&
    typeof (block as { text?: unknown }).text === "string"
  );
};

const extractText = (result: ToolCallResult): string => {
  if (Array.isArray(result.content)) {
    const text = result.content.find(isTextBlock);
    if (text) {
      return text.text;
    }
    return JSON.stringify(result.content, null, 2);
  }
  if (result.toolResult !== undefined) {
    return JSON.stringify(result.toolResult, null, 2);
  }
  return "<no response>";
};

const buildPrompt = (history: Message[], current: string) => {
  const serialized = history
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
  return `Conversation history:\n${serialized}\nUSER: ${current}`;
};

export class AgentService {
  private readonly store: ConversationStore;
  private readonly client: McpHttpClient;

  private readonly sanitizeProgress = (chunk: string | undefined) => {
    if (!chunk?.trim()) {
      return "";
    }
    return chunk;
  };

  private formatPrompt(conversationId: string, content: string) {
    this.store.appendMessage(conversationId, "user", content);
    const context = this.store.getRecentMessages(
      conversationId,
      config.maxHistory
    );
    return buildPrompt(context, content);
  }

  constructor(
    store: ConversationStore,
    clientConfig: ClientConfig = config.client
  ) {
    this.store = store;
    this.client = new McpHttpClient(clientConfig);
  }

  async sendMessage(conversationId: string, content: string) {
    const { assistant } = await this.streamMessage(conversationId, content);
    return assistant;
  }

  async streamMessage(
    conversationId: string,
    content: string,
    handlers: {
      onProgress?: (delta: string) => void;
      onComplete?: (conversation: Conversation, message: Message) => void;
    } = {}
  ) {
    const query = this.formatPrompt(conversationId, content);

    const result = await this.client.callDeepReasoningSearch(query, {
      timeout: config.requestTimeoutMs,
      onprogress: (progress) => {
        const delta = this.sanitizeProgress(progress.message);
        if (delta) {
          handlers.onProgress?.(delta);
        }
      },
    });
    const answer = extractText(result as ToolCallResult);
    const assistantMessage = this.store.appendMessage(
      conversationId,
      "assistant",
      answer
    );
    const conversation = this.store.getConversation(conversationId);
    if (conversation) {
      handlers.onComplete?.(conversation, assistantMessage);
    }
    return {
      assistant: assistantMessage,
      conversation,
    };
  }

  getStore() {
    return this.store;
  }

  async close() {
    await this.client.close();
  }
}
