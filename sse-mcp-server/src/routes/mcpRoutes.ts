import type { Express, Request, Response } from "express";

import { TransportManager } from "../mcp/transportManager";

const HTTP_ERROR = {
  invalidSession: {
    status: 400,
    payload: {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid session. Initialize first." },
      id: null,
    },
  },
  internal: {
    status: 500,
    payload: {
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    },
  },
};

export const setupMcpRoutes = (
  app: Express,
  transportManager: TransportManager
) => {
  app.post("/messages", async (req, res) => {
    try {
      const transport = await transportManager.ensureTransport(req);

      if (!transport) {
        res
          .status(HTTP_ERROR.invalidSession.status)
          .json(HTTP_ERROR.invalidSession.payload);
        return;
      }

      await transport.handleRequest(
        req as Request & { body: unknown },
        res,
        req.body
      );
    } catch (error) {
      console.error("POST /messages failed:", error);

      if (!res.headersSent) {
        res
          .status(HTTP_ERROR.internal.status)
          .json(HTTP_ERROR.internal.payload);
      }
    }
  });

  app.get("/sse", async (req, res) => {
    const sessionId = req.header("mcp-session-id");

    if (!sessionId) {
      res
        .status(HTTP_ERROR.invalidSession.status)
        .send("Missing mcp-session-id header");
      return;
    }

    const transport = transportManager.get(sessionId);

    if (!transport) {
      res.status(HTTP_ERROR.invalidSession.status).send("Unknown session");
      return;
    }

    try {
      await transport.handleRequest(req as Request & { body?: unknown }, res);
    } catch (error) {
      console.error("GET /sse failed:", error);

      if (!res.headersSent) {
        res.status(500).end("SSE failure");
      }
    }
  });

  app.delete("/messages", async (req, res) => {
    const sessionId = req.header("mcp-session-id");

    if (!sessionId) {
      res
        .status(HTTP_ERROR.invalidSession.status)
        .send("Missing mcp-session-id header");
      return;
    }

    const transport = transportManager.get(sessionId);

    if (!transport) {
      res.status(HTTP_ERROR.invalidSession.status).send("Unknown session");
      return;
    }

    try {
      await transport.handleRequest(req as Request & { body?: unknown }, res);
    } catch (error) {
      console.error("DELETE /messages failed:", error);

      if (!res.headersSent) {
        res.status(500).end("Failed to close session");
      }
    }
  });
};
