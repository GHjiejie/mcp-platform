

# 产品需求文档 (PRD)

| 项目 | 内容 |
| :--- | :--- |
| **项目名称** | **Local DeepReasoning Knowledge Node (Node.js Edition)** |
| **文档版本** | **V0.0.1 (Node.js Backend)** |
| **项目代号** | `LDR-Node` |
| **核心技术栈** | **Runtime**: Node.js (v20+) <br> **Protocol**: MCP (SSE) <br> **Framework**: LlamaIndexTS / LangChain.js |
| **核心模型** | **LLM**: DeepSeek-R1:7b (via Ollama) <br> **Embedding**: BAAI/bge-m3 (via Ollama/ONNX) |
| **数据源路径** | `/Users/jie/Documents/knowledgeBase` |
| **产品负责人** | PM |
| **状态** | 🟢 待开发 |

---

## 1. 产品概述 (Overview)

### 1.1 背景
为了更好地适配前端生态及轻量化部署需求，我们将后端架构从 Python 迁移至 Node.js。业务目标保持不变：在**完全离线、隐私安全**的前提下，利用 **DeepSeek-R1** 的推理能力和 **BGE-M3** 的高精度检索能力，对本地文档进行深度问答。

### 1.2 产品目标
构建一个基于 **Node.js** 的 MCP Server，作为 Claude Desktop 的本地扩展。系统需利用 Node.js 的高并发特性处理 I/O 密集型任务（如文件扫描），并通过 API 与本地 AI 引擎交互。

---

## 2. 系统架构与逻辑 (System Architecture)

### 2.1 技术架构图
```mermaid
graph LR
    Client[Claude Desktop] -- SSE (HTTP) --> NodeServer[Node.js MCP Server]
    NodeServer -- I/O --> FileSystem[本地文件系统]
    NodeServer -- REST API --> OllamaService[本地 Ollama 服务]
    OllamaService -- 推理 --> DeepSeek[DeepSeek-R1]
    OllamaService -- 向量化 --> BGEM3[BGE-M3]
    NodeServer -- 读写 --> VectorStore[本地向量存储 (JSON/LanceDB)]
```

### 2.2 关键组件选型
*   **Server Runtime**: **Node.js** (推荐使用 TypeScript 开发以保证类型安全)。
*   **MCP SDK**: `@modelcontextprotocol/sdk` (官方 Node.js SDK)。
*   **Web Server**: `Express` 或 `Fastify` (用于承载 SSE 端点)。
*   **RAG Framework**: **LlamaIndexTS** (LlamaIndex 的 TypeScript 版本) 或 **LangChain.js**。
*   **Model Provider**: **Ollama** (同时托管 LLM 和 Embedding 模型，提供统一 HTTP 接口给 Node.js 调用)。

---

## 3. 功能需求 (Functional Requirements)

### 3.1 模块一：通信服务 (Communication Layer)

| ID | 功能名称 | 详细需求描述 | 验收标准 | 优先级 |
| :--- | :--- | :--- | :--- | :--- |
| **FR-01** | **SSE 接口** | 基于 Express/Fastify 实现 SSE 路由，暴露 `/sse` 和 `/messages`。 | Claude 客户端连接时，控制台显示 `Client connected`，且无 `CORS` 错误。 | P0 |
| **FR-02** | **工具定义** | 通过 MCP SDK 定义并广播 `deep_reasoning_search` 工具。 | 工具 Schema 符合 JSON Draft-07 标准，客户端可识别。 | P0 |
| **FR-03** | **异步并发** | 利用 Node.js 事件循环机制，非阻塞处理文件读取和 AI 请求。 | 在生成回答时，服务仍能响应其他轻量级请求（如 List Tools）。 | P1 |

### 3.2 模块二：知识库管理 (Knowledge Base)

| ID | 功能名称 | 详细需求描述 | 验收标准 | 优先级 |
| :--- | :--- | :--- | :--- | :--- |
| **FR-04** | **文件扫描** | 使用 Node.js `fs/promises` 模块递归读取 `/Users/jie/Documents/knowledgeBase`。 | 1. 忽略隐藏文件。<br>2. 支持 `.md`, `.txt`, `.pdf` (需集成 `pdf-parse` 等库)。 | P0 |
| **FR-05** | **Embedding 集成** | 调用本地 Ollama 的 Embedding 接口 (`model: bge-m3`) 获取向量。 | 禁止使用在线 API。若 Ollama 未加载 bge-m3，需抛出错误。 | P0 |
| **FR-06** | **向量存储** | 将生成的向量和文本块存储在本地（推荐 `VectorStoreIndex` 配合文件存储）。 | 服务重启后，通过读取本地缓存文件（如 `storage.json`）恢复索引，耗时 < 5s。 | P1 |

### 3.3 模块三：推理与生成 (Inference)

| ID | 功能名称 | 详细需求描述 | 验收标准 | 优先级 |
| :--- | :--- | :--- | :--- | :--- |
| **FR-07** | **DeepSeek 调用** | 通过 HTTP 请求调用本地 Ollama (`model: deepseek-r1:7b`)。 | 设置 `options: { temperature: 0.6, num_ctx: 8192 }`。 | P0 |
| **FR-08** | **流式转发** | 将 Ollama 返回的流式响应（Token stream）实时转换并推送到 SSE 管道。 | 客户端体验流畅，像打字机一样显示结果，包含 `<think>` 思考过程。 | P0 |
| **FR-09** | **RAG 逻辑** | 1. 将用户 Query 向量化 (BGE-M3)。<br>2. 检索 Top-5 相关切片。<br>3. 构造 Prompt 模板注入上下文。 | 检索结果必须包含源文件名信息。 | P0 |

---

## 4. 接口定义 (Interface Specifications)

### 4.1 MCP 工具定义 (Tool Definition)
Node.js 服务需注册如下 Tool：

```typescript
{
  name: "deep_reasoning_search",
  description: "Use DeepSeek-R1 to perform deep reasoning and search over local files. Essential for complex queries.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The question requiring deep analysis of local documents."
      }
    },
    required: ["query"]
  }
}
```

### 4.2 数据交互格式
*   **Request (Client -> Server)**: JSON-RPC 2.0 格式。
*   **Response (Server -> Client)**: MCP `CallToolResult` 结构，内容包含文本和（可选的）资源引用。

---

## 5. 非功能需求 (Non-Functional Requirements)

### 5.1 性能要求
*   **I/O 性能**：文件扫描应利用 Node.js 的异步特性，1000 个文本文件的目录遍历耗时 < 2秒。
*   **内存管理**：Node.js 默认堆内存限制较小（约 2GB），需通过 `NODE_OPTIONS="--max-old-space-size=8192"` 增加内存限制，以处理大型向量索引。

### 5.2 依赖管理
*   **包管理器**：推荐使用 `pnpm` 或 `npm`。
*   **Ollama 依赖**：Node.js 服务端**不直接运行模型**，完全依赖本地 Ollama 进程。这意味着 Node.js 进程本身非常轻量，压力在 Ollama 进程上。

### 5.3 错误处理
*   **Promise Rejection**：必须捕获所有异步操作的异常，防止 Node 进程崩溃退出。
*   **连接断开**：当 Claude 关闭 SSE 连接时，服务端应停止正在进行的 Ollama 生成任务（通过 AbortController），释放资源。

---

## 6. 实施注意事项 (Implementation Notes)

### 6.1 前置条件
开发与运行前，必须在系统终端执行以下命令（Ollama 侧）：
```bash
# 下载推理模型
ollama pull deepseek-r1:7b
# 下载 Embedding 模型 (供 Node.js 调用)
ollama pull bge-m3
```

### 6.2 推荐 Node.js 库清单
*   `@modelcontextprotocol/sdk`: MCP 协议核心。
*   `express`: Web 服务。
*   `llamaindex` (TS版): 处理 RAG 流程。
*   `ollama`: 官方 Node.js 客户端库，用于便捷连接本地 Ollama。
*   `dotenv`: 环境变量管理。

### 6.3 风险点
*   **JSON 解析性能**：如果本地向量索引文件极大（如 > 500MB JSON），Node.js 的 `JSON.parse` 可能会阻塞主线程。建议使用流式解析或专用的向量数据库（如 LanceDB 的 Node 绑定）作为 V2.0 优化项。V1.0 可直接加载内存。

---

## 7. 附录：配置与启动

### 7.1 Claude Config (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "node-deepseek-kb": {
      "command": "node",
      "args": ["/path/to/your/build/index.js"],
      "env": {
        "KNOWLEDGE_BASE_PATH": "/Users/jie/Documents/knowledgeBase",
        "OLLAMA_HOST": "http://127.0.0.1:11434"
      }
    }
  }
}
```
*(注：如果使用 SSE 模式，配置则为 `url` 字段，指向 Node 服务地址)*

### 7.2 环境变量
*   `PORT`: 8000
*   `OLLAMA_MODEL`: deepseek-r1:7b
*   `EMBEDDING_MODEL`: bge-m3
*   `EMBEDDING_MODEL`: bge-m3