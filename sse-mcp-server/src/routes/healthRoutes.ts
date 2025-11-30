import type { Express } from "express";

import { env } from "../config/env";

export const setupHealthRoutes = (app: Express) => {
  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      knowledgeBasePath: env.knowledgeBasePath,
      embeddings: env.embeddingModel,
      llm: env.ollamaModel,
    });
  });
};
