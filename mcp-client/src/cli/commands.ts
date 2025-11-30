import { Command } from "commander";
import chalk from "chalk";
import type { Progress } from "@modelcontextprotocol/sdk/types.js";

import { McpHttpClient } from "../mcp/client";

type ToolCallResponse = Awaited<
  ReturnType<McpHttpClient["callDeepReasoningSearch"]>
>;

type TextBlock = { type: "text"; text: string };

const withClient = async (
  runner: (client: McpHttpClient) => Promise<void>
): Promise<void> => {
  const client = new McpHttpClient();
  try {
    await runner(client);
  } finally {
    await client.close();
  }
};

const printProgress = (progress: Progress) => {
  const segments = [
    progress.progress !== undefined ? `#${progress.progress}` : null,
    progress.message ?? null,
  ].filter(Boolean);

  if (!segments.length) {
    return;
  }

  console.log(chalk.dim(`[progress] ${segments.join(" ")}`));
};

const hasContentBlocks = (
  result: ToolCallResponse
): result is ToolCallResponse & { content: unknown[] } => {
  return Array.isArray((result as { content?: unknown }).content);
};

const isTextBlock = (chunk: unknown): chunk is TextBlock => {
  return (
    typeof chunk === "object" &&
    chunk !== null &&
    (chunk as TextBlock).type === "text" &&
    typeof (chunk as TextBlock).text === "string"
  );
};

const extractTextResult = (result: ToolCallResponse) => {
  if (hasContentBlocks(result)) {
    for (const block of result.content as unknown[]) {
      if (isTextBlock(block)) {
        return block.text;
      }
    }
    return JSON.stringify(result.content, null, 2);
  }

  if ((result as { toolResult?: unknown }).toolResult !== undefined) {
    return JSON.stringify(
      (result as { toolResult?: unknown }).toolResult,
      null,
      2
    );
  }

  return "<no content>";
};

export const buildCli = () => {
  const program = new Command();

  program
    .name("mcp-client")
    .description("Interact with the Local DeepReasoning MCP server")
    .option("-d, --debug", "Enable verbose logging");

  program
    .command("list-tools")
    .description("List tools exposed by the MCP server")
    .action(async () => {
      await withClient(async (client) => {
        const response = await client.listTools();
        if (!response.tools.length) {
          console.log("No tools reported by the server.");
          return;
        }

        for (const tool of response.tools) {
          const description = tool.description ? ` - ${tool.description}` : "";
          console.log(`${chalk.green(tool.name)}${description}`);
        }
      });
    });

  program
    .command("call")
    .description("Call the deep_reasoning_search tool")
    .requiredOption("-q, --query <text>", "Question to ask the knowledge base")
    .option("--json", "Print the raw JSON response")
    .action(async (opts: { query: string; json?: boolean }) => {
      await withClient(async (client) => {
        const result = await client.callDeepReasoningSearch(opts.query, {
          onprogress: printProgress,
          resetTimeoutOnProgress: true,
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(extractTextResult(result));
      });
    });

  return program;
};
