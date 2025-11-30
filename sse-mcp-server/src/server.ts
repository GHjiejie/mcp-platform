import { createApp } from "./app";
import { env } from "./config/env";

const bootstrap = async () => {
  const { app } = await createApp();

  app.listen(env.port, () => {
    console.log(
      `Local DeepReasoning MCP server listening on http://localhost:${env.port}`
    );
    console.log(`Knowledge base -> ${env.knowledgeBasePath}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
