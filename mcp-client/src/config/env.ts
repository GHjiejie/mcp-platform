import "dotenv/config";

declare const process: {
  env: Record<string, string | undefined>;
};

export type ClientConfig = {
  baseUrl: string;
  messagesUrl: string;
  sseUrl: string;
  clientName: string;
  clientVersion: string;
  requestTimeoutMs: number;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_MESSAGES_PATH = "/messages";
const DEFAULT_SSE_PATH = "/sse";
const DEFAULT_CLIENT_NAME = "local-deepreasoning-client";
const DEFAULT_CLIENT_VERSION = "0.0.1";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const normalizePath = (value: string) => {
  if (!value.trim()) {
    return "/";
  }
  return value.startsWith("/") ? value : `/${value}`;
};

export const loadConfig = (): ClientConfig => {
  const base = (process.env.MCP_SERVER_BASE_URL ?? DEFAULT_BASE_URL).trim();
  const messagesPath = normalizePath(
    process.env.MCP_MESSAGES_PATH ?? DEFAULT_MESSAGES_PATH
  );
  const ssePath = normalizePath(process.env.MCP_SSE_PATH ?? DEFAULT_SSE_PATH);

  const baseUrl = new URL(base);
  const messagesUrl = new URL(messagesPath, baseUrl);
  const sseUrl = new URL(ssePath, baseUrl);

  const requestTimeoutMs = Number(
    process.env.MCP_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  );

  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    messagesUrl: messagesUrl.toString(),
    sseUrl: sseUrl.toString(),
    clientName: process.env.MCP_CLIENT_NAME ?? DEFAULT_CLIENT_NAME,
    clientVersion: process.env.MCP_CLIENT_VERSION ?? DEFAULT_CLIENT_VERSION,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs)
      ? requestTimeoutMs
      : DEFAULT_TIMEOUT_MS,
  };
};
