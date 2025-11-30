import type { Conversation } from "../types/chat";
export declare const getStoredConversationId: () => string | null;
export declare const setStoredConversationId: (id: string) => void;
export declare const clearConversationId: () => void;
export declare const createConversation: (title?: string) => Promise<Conversation>;
export declare const fetchConversation: (id: string) => Promise<Conversation>;
export declare const sendMessage: (id: string, content: string) => Promise<Conversation>;
export declare const listConversations: () => Promise<Conversation[]>;
type StreamOptions = {
    signal?: AbortSignal;
    onProgress?: (delta: string) => void;
    onDone?: (conversation: Conversation) => void;
    onError?: (message: string) => void;
};
export declare const sendMessageStream: (id: string, content: string, options: StreamOptions) => Promise<void>;
export {};
