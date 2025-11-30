import axios from "axios";

import type { Conversation } from "../types/chat";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
});

const API_BASE_URL = api.defaults.baseURL?.replace(/\/$/, "") ?? "";

const resolveUrl = (path: string) =>
  API_BASE_URL ? `${API_BASE_URL}${path}` : path;

const STORAGE_KEY = "ldr.conversation.id";

export const getStoredConversationId = () => localStorage.getItem(STORAGE_KEY);

export const setStoredConversationId = (id: string) => {
  localStorage.setItem(STORAGE_KEY, id);
};

export const clearConversationId = () => localStorage.removeItem(STORAGE_KEY);

export const createConversation = async (
  title?: string
): Promise<Conversation> => {
  const response = await api.post<{ conversation: Conversation }>(
    "/api/conversations",
    { title }
  );
  setStoredConversationId(response.data.conversation.id);
  return response.data.conversation;
};

export const fetchConversation = async (id: string): Promise<Conversation> => {
  const response = await api.get<{ conversation: Conversation }>(
    `/api/conversations/${id}`
  );
  return response.data.conversation;
};

export const sendMessage = async (
  id: string,
  content: string
): Promise<Conversation> => {
  const response = await api.post<{ conversation: Conversation }>(
    `/api/conversations/${id}/messages`,
    { content }
  );
  return response.data.conversation;
};

export const listConversations = async (): Promise<Conversation[]> => {
  const response = await api.get<{ conversations: Conversation[] }>(
    "/api/conversations"
  );
  return response.data.conversations;
};

type StreamOptions = {
  signal?: AbortSignal;
  onProgress?: (delta: string) => void;
  onDone?: (conversation: Conversation) => void;
  onError?: (message: string) => void;
};

const parseSseChunk = (chunk: string) => {
  const lines = chunk.split("\n");
  let eventType = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }
  return { eventType, data };
};

export const sendMessageStream = async (
  id: string,
  content: string,
  options: StreamOptions
): Promise<void> => {
  const response = await fetch(
    resolveUrl(`/api/conversations/${id}/messages/stream`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: options.signal,
    }
  );

  if (!response.ok || !response.body) {
    throw new Error("无法建立流式连接");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let streamError: string | null = null;

  const handlePayload = (payload: string) => {
    if (!payload.trim()) {
      return;
    }
    const { eventType, data } = parseSseChunk(payload);
    if (!data) {
      return;
    }
    try {
      const parsed = JSON.parse(data);
      if (eventType === "progress" && typeof parsed.delta === "string") {
        options.onProgress?.(parsed.delta);
      } else if (eventType === "done" && parsed.conversation) {
        options.onDone?.(parsed.conversation as Conversation);
      } else if (eventType === "error") {
        const message =
          typeof parsed.message === "string"
            ? parsed.message
            : "流式响应发生错误";
        options.onError?.(message);
        streamError = message;
      }
    } catch (error) {
      console.error("Failed to parse SSE payload", error);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      handlePayload(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let splitIndex;
    while ((splitIndex = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);
      handlePayload(chunk);
      if (streamError) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    if (streamError) {
      break;
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
};
