import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type JSONRPCNotification } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { KnowledgeBaseIndex } from "../services/knowledgeBaseIndex";
import { OllamaGateway } from "../services/ollamaGateway";

const toolInputSchema = z.object({
  query: z.string(),
});

type ToolDependencies = {
  knowledgeBase: KnowledgeBaseIndex;
  ollamaGateway: OllamaGateway;
};

export const registerDeepReasoningTool = (
  server: McpServer,
  { knowledgeBase, ollamaGateway }: ToolDependencies
) => {
  server.registerTool(
    "deep_reasoning_search",
    {
      title: "Deep Reasoning Search",
      description: "使用DeepSeek-R1进行深度推理和本地文件搜索",
      inputSchema: toolInputSchema,
    },
    async ({ query }, extra: any) => {
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

        await server.server.notification(notification, {
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
          {
            onChunk: emitProgress,
            signal: abortController.signal,
          }
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
};
