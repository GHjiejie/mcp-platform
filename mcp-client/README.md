# MCP Client

This package contains a command-line client that talks to the SSE-based MCP server in `sse-mcp-server/`. It uses the official `@modelcontextprotocol/sdk` client APIs with the Streamable HTTP transport to:

- establish a session with the MCP server via the `/messages` endpoint
- keep a dedicated SSE stream open against `/sse` for push notifications
- list the tools exposed by the server
- call the `deep_reasoning_search` tool with streaming progress updates

## Planned structure

    ├── config/
```bash
cd mcp-client
npm install

# During development (ts-node-dev)
    │   └── commands.ts    # Commander-based CLI definitions
npm run dev -- call -q "如何索引 PDF?"

# Create a local CLI binary
npm run link          # builds + npm link
mcp-client list-tools # now available in your shell

# Or run the compiled build without linking
npm run build
npx mcp-client call -q "explain rag pipeline"
```
    └── index.ts           # Entry point wiring everything together
```

## Setup & usage

```bash
cd mcp-client
npm install

# During development (ts-node-dev)
npm run dev -- list-tools
npm run dev -- call -q "如何索引 PDF?"

# Or run the compiled build
npm run build
node build/index.js call -q "explain rag pipeline"
```

The CLI currently exposes two subcommands:

- `list-tools` — prints the server-reported tool catalog.
- `call` — invokes `deep_reasoning_search` with `--query/-q` and optional `--json` to dump the raw payload.

Progress notifications forwarded by the server show up as dim `[progress]` log lines while the tool is running.

## Configuration surface

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_SERVER_BASE_URL` | `http://127.0.0.1:8000` | Origin of the SSE MCP server |
| `MCP_MESSAGES_PATH` | `/messages` | Path for JSON-RPC POST/DELETE calls |
| `MCP_SSE_PATH` | `/sse` | Path for Server-Sent Events |
| `MCP_CLIENT_NAME` | `local-deepreasoning-client` | Identifier reported during `initialize` |
| `MCP_CLIENT_VERSION` | `0.0.1` | Version reported during handshake |
| `MCP_REQUEST_TIMEOUT_MS` | `300000` | Tool call timeout budget |

## CLI sketch

```
pnpm dev list-tools
pnpm dev call --query "how do we index pdfs?"
```

Both commands will:

1. Bootstrap environment/config
2. Create a `StreamableHTTPClientTransport` with the split fetch helper
3. Connect the MCP client and run the selected action
4. Close the session cleanly when finished
```},