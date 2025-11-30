import { randomUUID } from "node:crypto";
import type { Request } from "express";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

export class TransportManager {
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(private readonly server: McpServer) {}

  private createTransport() {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.transports.set(sessionId, transport);
        console.log(`Session initialized: ${sessionId}`);
      },
      onsessionclosed: (sessionId) => {
        this.transports.delete(sessionId);
        console.log(`Session closed: ${sessionId}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;

      if (sid) {
        this.transports.delete(sid);
        console.log(`Transport closed for session ${sid}`);
      }
    };

    return transport;
  }

  async ensureTransport(
    req: Request
  ): Promise<StreamableHTTPServerTransport | null> {
    const sessionId = req.header("mcp-session-id") ?? undefined;

    if (sessionId && this.transports.has(sessionId)) {
      return this.transports.get(sessionId)!;
    }

    if (isInitializeRequest(req.body)) {
      const transport = this.createTransport();
      await this.server.connect(transport);
      return transport;
    }

    return null;
  }

  get(sessionId: string) {
    return this.transports.get(sessionId);
  }
}
