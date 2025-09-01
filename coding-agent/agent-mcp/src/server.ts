import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAgentTools } from "./tools.js";

const PORT = parseInt(process.env.PORT ?? "4011", 10);
const app = express();
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
  const host = req.headers["host"] ?? "";
  if (!/^localhost(?::\d+)?$/.test(String(host)) && !/^127\.0\.0\.1(?::\d+)?$/.test(String(host))) {
    return res.status(403).json({ error: "Host not allowed" });
  }
  const sid = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  if (sid && transports[sid]) {
    transport = transports[sid];
  } else if (!sid) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport!;
      },
      enableDnsRebindingProtection: false
    });
    transport.onclose = () => {
      if (transport?.sessionId) delete transports[transport.sessionId];
    };
    const server = new McpServer({ name: "agent-mcp", version: "0.1.0" });
    registerAgentTools(server);
    await server.connect(transport);
  }
  if (!transport) return res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" } });
  return transport.handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`agent-mcp listening on http://localhost:${PORT}/mcp`);
});

