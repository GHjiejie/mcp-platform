import express, { type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";

import { config } from "./config/env";
import { AgentService } from "./services/agentService";
import { ConversationStore } from "./services/conversationStore";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const store = new ConversationStore();
const agent = new AgentService(store);

const messageSchema = z.object({
  content: z.string().min(1, "内容不能为空"),
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    knowledgeBase: config.client.baseUrl,
  });
});

app.get("/api/conversations", (_req: Request, res: Response) => {
  res.json({ conversations: store.listConversations() });
});

app.post("/api/conversations", (req: Request, res: Response) => {
  const title = typeof req.body?.title === "string" ? req.body.title : "新会话";
  const conversation = store.createConversation(title);
  res.status(201).json({ conversation });
});

app.get("/api/conversations/:id", (req: Request, res: Response) => {
  const conversation = store.getConversation(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: "会话不存在" });
    return;
  }
  res.json({ conversation });
});

app.post(
  "/api/conversations/:id/messages",
  async (req: Request, res: Response) => {
    const conversation = store.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "会话不存在" });
      return;
    }
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.flatten().formErrors.join(", ") });
      return;
    }

    try {
      const reply = await agent.sendMessage(
        conversation.id,
        parsed.data.content
      );
      res.json({ conversation: store.getConversation(conversation.id), reply });
    } catch (error) {
      console.error("Agent error", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }
);

app.post(
  "/api/conversations/:id/messages/stream",
  async (req: Request, res: Response) => {
    const conversation = store.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "会话不存在" });
      return;
    }
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.flatten().formErrors.join(", ") });
      return;
    }

    req.socket.setTimeout(0);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      const maybeFlush = (res as Response & { flush?: () => void }).flush;
      if (typeof maybeFlush === "function") {
        maybeFlush.call(res);
      }
    };

    try {
      await agent.streamMessage(conversation.id, parsed.data.content, {
        onProgress: (delta) => {
          sendEvent("progress", { delta });
        },
        onComplete: (updatedConversation, reply) => {
          sendEvent("done", { conversation: updatedConversation, reply });
        },
      });
    } catch (error) {
      console.error("Streaming agent error", error);
      sendEvent("error", {
        message: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      res.end();
    }
  }
);

const server = app.listen(config.port, () => {
  console.log(`Chat backend listening on http://localhost:${config.port}`);
});

const shutdown = async () => {
  console.log("Shutting down chat backend...");
  server.close();
  await agent.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
