import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express, { Request } from "express";
import cors from "cors";
import pdfParse from "pdf-parse";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  isInitializeRequest,
  type JSONRPCNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Ollama, type AbortableAsyncIterator, type ChatResponse } from "ollama";

type VectorChunk = {
  id: string;
  filePath: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  mtimeMs: number;
};

type PersistedFileEntry = {
  filePath: string;
  mtimeMs: number;
  size: number;
  chunks: VectorChunk[];
};

type PersistedVectorStore = {
  knowledgeBasePath: string;
  builtAt: string;
  files: PersistedFileEntry[];
};

const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".pdf"]);

const PORT = Number(process.env.PORT ?? 8000);
const KNOWLEDGE_BASE_PATH = path.resolve(
  process.env.KNOWLEDGE_BASE_PATH ?? "/Users/jie/Documents/knowledgeBase"
);
const VECTOR_CACHE_PATH = path.resolve(
  process.env.VECTOR_CACHE_PATH ?? path.join(process.cwd(), "storage.json")
);
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deepseek-r1:7b";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "bge-m3";

class OllamaGateway {
  private readonly client: Ollama;

  constructor(private readonly host: string) {
    this.client = new Ollama({ host });
  }

  async embed(text: string): Promise<number[]> {
    if (!text.trim()) {
      return [];
    }
    try {
      const response = await this.client.embeddings({
        model: EMBEDDING_MODEL,
        prompt: text,
      });
      if (!response.embedding?.length) {
        throw new Error(
          "Embedding vector is empty. Is the model loaded in Ollama?"
        );
      }
      return response.embedding;
    } catch (error) {
      throw new Error(
        `Failed to create embedding via Ollama (${EMBEDDING_MODEL}) at ${
          this.host
        }: ${(error as Error).message}`
      );
    }
  }

  async streamDeepSeekResponse(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => Promise<void>,
    signal: AbortSignal
  ): Promise<string> {
    let stream: AbortableAsyncIterator<ChatResponse>;
    try {
      stream = (await this.client.chat({
        model: OLLAMA_MODEL,
        messages,
        stream: true,
        keep_alive: "5m",
        options: {
          temperature: 0.6,
          num_ctx: 8192,
        },
      })) as AbortableAsyncIterator<ChatResponse>;
    } catch (error) {
      throw new Error(
        `Failed to start DeepSeek streaming via Ollama (${OLLAMA_MODEL}) at ${
          this.host
        }: ${(error as Error).message}`
      );
    }

    const abortHandler = () => stream.abort();
    if (signal.aborted) {
      stream.abort();
      throw new Error("Request aborted before generation started");
    }
    signal.addEventListener("abort", abortHandler);

    let accumulator = "";
    try {
      for await (const chunk of stream) {
        const token = chunk.message?.content ?? "";
        if (!token) {
          continue;
        }
        accumulator += token;
        await onChunk(token);
      }
      return accumulator.trim();
    } finally {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

class KnowledgeBaseIndex {
  private entries: VectorChunk[] = [];

  constructor(
    private readonly rootDir: string,
    private readonly cachePath: string,
    private readonly embeddings: OllamaGateway
  ) {}

  async warmUp(): Promise<void> {
    const persisted = await this.readCache();
    const files = await this.findEligibleFiles(this.rootDir);
    const rebuilt: PersistedFileEntry[] = [];

    for (const filePath of files) {
      try {
        const stats = await fs.stat(filePath);
        const existing = persisted?.files.find(
          (entry) =>
            entry.filePath === filePath &&
            entry.mtimeMs === stats.mtimeMs &&
            entry.size === stats.size
        );

        if (existing) {
          rebuilt.push(existing);
          continue;
        }

        const text = await this.extractText(filePath);
        if (!text.trim()) {
          continue;
        }

        const chunks = this.chunkText(text).map((content, index) => ({
          id: randomUUID(),
          filePath,
          fileName: path.basename(filePath),
          chunkIndex: index,
          content,
          embedding: [] as number[],
          mtimeMs: stats.mtimeMs,
        }));

        for (const chunk of chunks) {
          chunk.embedding = await this.embeddings.embed(chunk.content);
        }

        rebuilt.push({
          filePath,
          mtimeMs: stats.mtimeMs,
          size: stats.size,
          chunks,
        });
      } catch (error) {
        console.warn(
          `Failed to index ${filePath}: ${(error as Error).message}`
        );
      }
    }

    this.entries = rebuilt.flatMap((entry) => entry.chunks);
    await this.writeCache({
      knowledgeBasePath: this.rootDir,
      builtAt: new Date().toISOString(),
      files: rebuilt,
    });
  }

  async querySimilar(text: string, topK = 5): Promise<VectorChunk[]> {
    if (!this.entries.length) {
      return [];
    }
    const queryEmbedding = await this.embeddings.embed(text);
    if (!queryEmbedding.length) {
      return [];
    }
    const scored = this.entries
      .map((chunk) => ({
        chunk,
        score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
    return scored;
  }

  private async readCache(): Promise<PersistedVectorStore | null> {
    try {
      const buffer = await fs.readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(buffer) as PersistedVectorStore;
      if (parsed.knowledgeBasePath !== this.rootDir) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeCache(store: PersistedVectorStore): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      await fs.writeFile(
        this.cachePath,
        JSON.stringify(store, null, 2),
        "utf8"
      );
    } catch (error) {
      console.warn(
        `Failed to persist vector store: ${(error as Error).message}`
      );
    }
  }

  private async findEligibleFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const resolved = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.findEligibleFiles(resolved)));
      } else if (entry.isFile() && this.isAllowedFile(entry.name)) {
        results.push(resolved);
      }
    }
    return results;
  }

  private isAllowedFile(fileName: string): boolean {
    return ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
  }

  private async extractText(filePath: string): Promise<string> {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".pdf") {
      const buffer = await fs.readFile(filePath);
      const parsed = await pdfParse(buffer);
      return parsed.text ?? "";
    }
    return await fs.readFile(filePath, "utf8");
  }

  private chunkText(raw: string): string[] {
    const cleaned = raw.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
    if (!cleaned) {
      return [];
    }
    const chunkSize = 1000;
    const overlap = 200;
    const chunks: string[] = [];
    let start = 0;
    while (start < cleaned.length) {
      const end = Math.min(cleaned.length, start + chunkSize);
      chunks.push(cleaned.slice(start, end).trim());
      if (end === cleaned.length) {
        break;
      }
      start = Math.max(0, end - overlap);
    }
    return chunks.filter(Boolean);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) {
      return 0;
    }
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }
}

const createServer = async () => {
  try {
    await fs.access(KNOWLEDGE_BASE_PATH);
  } catch {
    throw new Error(
      `Knowledge base directory does not exist: ${KNOWLEDGE_BASE_PATH}`
    );
  }

  const ollamaGateway = new OllamaGateway(OLLAMA_HOST);
  const knowledgeBase = new KnowledgeBaseIndex(
    KNOWLEDGE_BASE_PATH,
    VECTOR_CACHE_PATH,
    ollamaGateway
  );
  await knowledgeBase.warmUp();

  const mcpServer = new McpServer(
    {
      name: "local-deepreasoning-node",
      version: "0.0.1",
      title: "Local DeepReasoning Knowledge Node",
    },
    {
      capabilities: {
        tools: { listChanged: true },
        logging: {},
      },
    }
  );

  const toolInputSchema = z.object({
    query: z.string(),
  });

  mcpServer.registerTool(
    "deep_reasoning_search",
    {
      title: "Deep Reasoning Search",
      description:
        "Use DeepSeek-R1 to perform deep reasoning and search over local files. Essential for complex queries.",
      inputSchema: toolInputSchema,
    },
    async ({ query }, extra) => {
      const abortController = new AbortController();
      const abortHandler = () => abortController.abort();
      extra.signal.addEventListener("abort", abortHandler);

      const progressToken = extra._meta?.progressToken;
      let progressCounter = 0;
      const emitProgress = async (message: string) => {
        if (!progressToken || !message.trim()) {
          return;
        }
        progressCounter += 1;
        const notification: JSONRPCNotification = {
          jsonrpc: "2.0",
          method: "notifications/progress",
          params: {
            progressToken,
            progress: progressCounter,
            message,
          },
        };
        await mcpServer.server.notification(notification, {
          relatedRequestId: extra.requestId,
        });
      };

      try {
        const chunks = await knowledgeBase.querySimilar(query, 5);
        const contextSection = chunks
          .map(
            (chunk, index) =>
              `Source ${index + 1}: ${chunk.fileName}\nPath: ${
                chunk.filePath
              }\nSnippet: ${chunk.content}`
          )
          .join("\n\n");

        const systemPrompt = `You are DeepSeek-R1 reasoning on behalf of a local knowledge base. Always cite the source file names when answering. If context is empty, say you cannot find supporting evidence.`;
        const userPrompt = `Query:\n${query}\n\nContext:\n${
          contextSection || "No related files were found."
        }`;

        const response = await ollamaGateway.streamDeepSeekResponse(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          emitProgress,
          abortController.signal
        );

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to complete reasoning: ${(error as Error).message}`,
            },
          ],
        };
      } finally {
        extra.signal.removeEventListener("abort", abortHandler);
      }
    }
  );

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  const createTransport = () => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
        console.log(`Session initialized: ${sessionId}`);
      },
      onsessionclosed: (sessionId) => {
        transports.delete(sessionId);
        console.log(`Session closed: ${sessionId}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        transports.delete(sid);
        console.log(`Transport closed for session ${sid}`);
      }
    };

    return transport;
  };

  const ensureTransport = async (
    req: Request
  ): Promise<StreamableHTTPServerTransport | null> => {
    const sessionId = req.header("mcp-session-id");
    if (sessionId && transports.has(sessionId)) {
      return transports.get(sessionId)!;
    }

    if (isInitializeRequest(req.body)) {
      const transport = createTransport();
      await mcpServer.connect(transport);
      return transport;
    }
    return null;
  };

  app.post("/messages", async (req, res) => {
    try {
      const transport = await ensureTransport(req);
      if (!transport) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Invalid session. Initialize first.",
          },
          id: null,
        });
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
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/sse", async (req, res) => {
    console.log("Client connected to SSE");
    const sessionId = req.header("mcp-session-id");
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Missing or unknown mcp-session-id header");
      return;
    }
    try {
      const transport = transports.get(sessionId)!;
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
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Missing or unknown mcp-session-id header");
      return;
    }
    try {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req as Request & { body?: unknown }, res);
    } catch (error) {
      console.error("DELETE /messages failed:", error);
      if (!res.headersSent) {
        res.status(500).end("Failed to close session");
      }
    }
  });

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      knowledgeBasePath: KNOWLEDGE_BASE_PATH,
      embeddings: EMBEDDING_MODEL,
      llm: OLLAMA_MODEL,
    });
  });

  app.listen(PORT, () => {
    console.log(
      `Local DeepReasoning MCP server listening on http://localhost:${PORT}`
    );
    console.log(`Knowledge base -> ${KNOWLEDGE_BASE_PATH}`);
  });
};

createServer().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
