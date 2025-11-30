import fs from "node:fs/promises";
import express from "express";
import cors from "cors";

import { env } from "./config/env";
import { createMcpServer } from "./mcp/serverFactory";
import { TransportManager } from "./mcp/transportManager";
import { registerDeepReasoningTool } from "./controllers/toolController";
import { KnowledgeBaseIndex } from "./services/knowledgeBaseIndex";
import { OllamaGateway } from "./services/ollamaGateway";
import { setupMcpRoutes } from "./routes/mcpRoutes";
import { setupHealthRoutes } from "./routes/healthRoutes";

export const createApp = async () => {
  try {
    await fs.access(env.knowledgeBasePath);
  } catch {
    throw new Error(
      `Knowledge base directory does not exist: ${env.knowledgeBasePath}`
    );
  }

  const ollamaGateway = new OllamaGateway({
    host: env.ollamaHost,
    llmModel: env.ollamaModel,
    embeddingModel: env.embeddingModel,
  });

  const knowledgeBase = new KnowledgeBaseIndex(
    env.knowledgeBasePath,
    env.vectorCachePath,
    ollamaGateway
  );
  await knowledgeBase.warmUp();

  const mcpServer = createMcpServer();
  registerDeepReasoningTool(mcpServer, { knowledgeBase, ollamaGateway });

  const transportManager = new TransportManager(mcpServer);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  setupMcpRoutes(app, transportManager);
  setupHealthRoutes(app);

  return { app };
};
