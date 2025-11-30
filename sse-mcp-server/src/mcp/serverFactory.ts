import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const createMcpServer = () =>
  new McpServer(
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
