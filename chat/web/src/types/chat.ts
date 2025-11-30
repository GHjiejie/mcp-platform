export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
};
