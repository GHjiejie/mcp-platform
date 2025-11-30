import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";
import { randomUUID } from "node:crypto";

import {
  type PersistedFileEntry,
  type PersistedVectorStore,
  type VectorChunk,
} from "../types/vector";
import { OllamaGateway } from "./ollamaGateway";

const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".pdf"]);

export class KnowledgeBaseIndex {
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

    return this.entries
      .map((chunk) => ({
        chunk,
        score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
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

    const denominator = Math.sqrt(magA) * Math.sqrt(magB);

    return denominator === 0 ? 0 : dot / denominator;
  }
}
