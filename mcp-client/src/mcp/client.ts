import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";

import { loadConfig, type ClientConfig } from "../config/env";
import { createSplitFetch } from "../transport/splitFetch";

export class McpHttpClient {
  private readonly config: ClientConfig;
  private readonly client: Client;
  private transport?: StreamableHTTPClientTransport;
  private connected = false;

  constructor(config: ClientConfig = loadConfig()) {
    this.config = config;
    this.client = new Client(
      {
        name: this.config.clientName,
        version: this.config.clientVersion,
      },
      {
        enforceStrictCapabilities: false,
      }
    );
  }

  private async ensureConnected() {
    if (this.connected) {
      return;
    }

    this.transport = new StreamableHTTPClientTransport(
      new URL(this.config.messagesUrl),
      {
        fetch: createSplitFetch(this.config.messagesUrl, this.config.sseUrl),
      }
    );

    this.transport.onerror = (error: Error) => {
      const message = error.message ?? "";
      if (error.name === "AbortError" || message.includes("AbortError")) {
        return;
      }
      console.error("[transport]", message);
    };

    try {
      await this.client.connect(this.transport);
      this.connected = true;
    } catch (error) {
      try {
        await this.transport.close();
      } catch {
        // ignore secondary close errors
      } finally {
        this.transport = undefined;
      }

      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      const hint =
        `Failed to connect to MCP server at ${this.config.baseUrl}. ` +
        `Is the SSE server running and reachable? ` +
        `Set MCP_SERVER_BASE_URL if it uses a different origin.`;

      throw new Error(`${hint}\nUnderlying error: ${message}`);
    }
  }

  async listTools() {
    await this.ensureConnected();
    return this.client.listTools();
  }

  async callDeepReasoningSearch(query: string, options?: RequestOptions) {
    await this.ensureConnected();
    return this.client.callTool(
      {
        name: "deep_reasoning_search",
        arguments: { query },
      },
      undefined,
      {
        timeout: this.config.requestTimeoutMs,
        ...options,
      }
    );
  }

  async close() {
    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
