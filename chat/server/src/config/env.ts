import "dotenv/config";
import { loadConfig, type ClientConfig } from "mcp-client/lib";

export type ServerConfig = {
  port: number;
  maxHistory: number;
  requestTimeoutMs: number;
  client: ClientConfig;
};

const defaultClientConfig = loadConfig();

const requestTimeoutMs = Number(
  process.env.AGENT_REQUEST_TIMEOUT_MS ?? defaultClientConfig.requestTimeoutMs
);

export const config: ServerConfig = {
  // port: Number(process.env.CHAT_BACKEND_PORT ?? 5175),
  port: 9001,
  maxHistory: Number(process.env.AGENT_MAX_HISTORY ?? 6),
  requestTimeoutMs: Number.isFinite(requestTimeoutMs)
    ? requestTimeoutMs
    : defaultClientConfig.requestTimeoutMs,
  client: {
    ...defaultClientConfig,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs)
      ? requestTimeoutMs
      : defaultClientConfig.requestTimeoutMs,
  },
};
