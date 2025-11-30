import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * Creates a fetch implementation that targets different HTTP paths depending on
 * the HTTP method. The MCP SDK currently assumes the same URL handles POST, GET
 * and DELETE, while our server exposes /messages and /sse. This wrapper keeps
 * the SDK happy without touching the server.
 */
export const createSplitFetch = (
  messagesUrl: string,
  sseUrl: string
): FetchLike => {
  const normalizedMessagesUrl = new URL(messagesUrl).toString();
  const normalizedSseUrl = new URL(sseUrl).toString();

  return async (_input, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const target = method === "GET" ? normalizedSseUrl : normalizedMessagesUrl;

    return globalThis.fetch(target, {
      ...init,
      method,
    });
  };
};
