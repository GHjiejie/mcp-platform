import { Ollama, type AbortableAsyncIterator, type ChatResponse } from "ollama";

type GatewayConfig = {
  host: string;
  llmModel: string;
  embeddingModel: string;
};

type StreamCallbacks = {
  onChunk: (chunk: string) => Promise<void>;
  signal: AbortSignal;
};

export class OllamaGateway {
  private readonly client: Ollama;

  constructor(private readonly config: GatewayConfig) {
    this.client = new Ollama({ host: config.host });
  }

  async embed(text: string): Promise<number[]> {
    if (!text.trim()) {
      return [];
    }

    try {
      const response = await this.client.embeddings({
        model: this.config.embeddingModel,
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
        `Failed to create embedding via Ollama (${
          this.config.embeddingModel
        }) at ${this.config.host}: ${(error as Error).message}`
      );
    }
  }

  async streamDeepSeekResponse(
    messages: { role: string; content: string }[],
    { onChunk, signal }: StreamCallbacks
  ): Promise<string> {
    let stream: AbortableAsyncIterator<ChatResponse>;

    try {
      stream = (await this.client.chat({
        model: this.config.llmModel,
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
        `Failed to start DeepSeek streaming via Ollama (${
          this.config.llmModel
        }) at ${this.config.host}: ${(error as Error).message}`
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
