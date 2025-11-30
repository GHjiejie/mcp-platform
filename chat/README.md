# 智能会话平台

该目录包含一个完整的本地智能会话体验，复用 `sse-mcp-server` 知识库与 `mcp-client` 工具栈：

- `server/`：Node.js (Express) 后端，封装单智能体，负责会话上下文管理与 `deep_reasoning_search` 调用。
- `web/`：Vue 3 + TypeScript 前端，提供聊天 UI、会话列表与实时交互。

## 启动步骤

1. **准备底座**  
   - 启动 `sse-mcp-server`（确保已完成向量索引与 Ollama 加载）。  
   - 在仓库根目录运行 `npm run build` 于 `mcp-client/`，保证最新 CLI 导出可供后端依赖。

2. **启动后端**
   ```bash
   cd chat/server
   npm install        # 首次需要
   npm run dev        # or npm run start (需先 npm run build)
   ```
   默认监听 `http://localhost:5175`，可通过下列环境变量调整：
   | 变量 | 默认值 | 说明 |
   | --- | --- | --- |
   | `CHAT_BACKEND_PORT` | `5175` | 后端服务端口 |
   | `MCP_SERVER_BASE_URL` | `http://127.0.0.1:8000` | MCP Server 基础地址 |
   | `MCP_MESSAGES_PATH` | `/messages` | MCP JSON-RPC Endpoint |
   | `MCP_SSE_PATH` | `/sse` | MCP SSE Endpoint |
   | `AGENT_MAX_HISTORY` | `6` | 上下文切片条数 |
   | `AGENT_REQUEST_TIMEOUT_MS` | `300000` | 工具调用超时 |

3. **启动前端**
   ```bash
   cd chat/web
   npm install        # 首次需要
   npm run dev        # http://localhost:5173
   ```
   如需代理到远程后端，可设置 `VITE_API_BASE_URL`（构建时）或 `VITE_API_PROXY`（开发代理）。

## API 概览

- `POST /api/conversations`：创建新会话。
- `GET /api/conversations`：列出会话。
- `GET /api/conversations/:id`：获取会话详情。
- `POST /api/conversations/:id/messages`：发送用户消息，自动触发智能体调用 `deep_reasoning_search`。
- `POST /api/conversations/:id/messages/stream`：与上一接口一致，但通过 SSE 推送增量 token，实现前端流式输出。

## 前端特性

- Vue 3 + Composition API + TypeScript。
- 会话列表 / 消息时间线 / 输入区。
- 自动滚动、Shift+Enter 换行、错误提示。
- 流式输出体验：请求发送后即刻渲染增量 Token，完成后自动同步权威记录。
- 本地存储当前会话 ID，刷新后继续上下文。

## 后端特性

- 复用 `mcp-client` 导出的 `McpHttpClient`，单实例复用 SSE 会话。
- 内存级会话存储（可根据需要扩展为数据库 / Redis）。
- 针对最近 `AGENT_MAX_HISTORY` 条消息构造 prompt，确保上下文延续。

> 注意：当前上下文保存在内存中，重启后会丢失；如需持久化可扩展 `ConversationStore` 实现。
