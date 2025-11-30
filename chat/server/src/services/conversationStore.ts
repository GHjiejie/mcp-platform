import { v4 as uuid } from "uuid";

export type Role = "user" | "assistant" | "system" | "tool";

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
};

export class ConversationStore {
  private conversations = new Map<string, Conversation>();

  createConversation(title = "新会话"): Conversation {
    const conversation: Conversation = {
      id: uuid(),
      title,
      createdAt: new Date().toISOString(),
      messages: [],
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  appendMessage(conversationId: string, role: Role, content: string): Message {
    const convo = this.conversations.get(conversationId);
    if (!convo) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    const message: Message = {
      id: uuid(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    convo.messages.push(message);
    return message;
  }

  getRecentMessages(conversationId: string, limit: number): Message[] {
    const convo = this.conversations.get(conversationId);
    if (!convo) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    return convo.messages.slice(-limit);
  }
}
