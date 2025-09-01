# doc-mcp (Streamable HTTP MCP Server)

A minimal demo MCP server using Streamable HTTP transport that exposes two tools for a tiny in-memory docs corpus.

- listLibraries()
- queryLibraryDoc(keyword: string, library: string)

## Run

```bash
npm install
npm run build
npm start
# listens on http://localhost:4001/mcp
```

## Connect with MCP Inspector

1. `npx @modelcontextprotocol/inspector`
2. Transport: Streamable HTTP
3. URL: `http://localhost:4001/mcp`
4. Connect

## Curl demo (full headers and bodies)

You can simulate an MCP client using curl to see raw response headers and SSE bodies:

```bash
npm run curl:demo
# or against another endpoint:
MCP_URL=http://localhost:4001/mcp npm run curl:demo
```

This will:
- Send `initialize` with `protocolVersion` and print all response headers (including `mcp-session-id`) and SSE body
- Send `notifications/initialized` using the captured session
- Call `tools/list`
- Call `tools/call listLibraries`
- Call `tools/call queryLibraryDoc` (keyword="hooks", library="react")

Note: Responses are `text/event-stream`; the script prints the SSE `event: message` frames as received.

## Tools

- listLibraries: returns ["node", "typescript", "react"]
- queryLibraryDoc: simple keyword match against a few entries; streams progress notifications

Notes:
- No external APIs. All data lives in `src/data.ts`.
- DNS rebinding protection allows only `localhost` and `127.0.0.1`.