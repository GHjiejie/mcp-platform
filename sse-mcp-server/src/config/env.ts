import "dotenv/config";
import path from "node:path";

const resolvePath = (value: string | undefined, fallback: string) =>
  path.resolve(value ?? fallback);

export const env = {
  port: Number(process.env.PORT ?? 8000),
  knowledgeBasePath: resolvePath(
    process.env.KNOWLEDGE_BASE_PATH,
    "/Users/jie/Documents/knowledgeBase"
  ),
  vectorCachePath: resolvePath(
    process.env.VECTOR_CACHE_PATH,
    path.join(process.cwd(), "storage.json")
  ),
  ollamaHost: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "deepseek-r1:7b",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "bge-m3",
};
