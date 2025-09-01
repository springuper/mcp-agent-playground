import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = parseInt(process.env.PORT ?? "4001", 10);

const app = express();

// In-memory session map
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
  // Enforce DNS rebinding protection (allow localhost only by default)
  const host = req.headers["host"] ?? "";
  if (!/^localhost(?::\d+)?$/.test(String(host)) && !/^127\.0\.0\.1(?::\d+)?$/.test(String(host))) {
    return res.status(403).json({ error: "Host not allowed" });
  }

  const sessionIdHeader = req.headers["mcp-session-id"] as string | undefined;
  console.log('sessionIdHeader', sessionIdHeader);
  let transport: StreamableHTTPServerTransport | undefined;

  if (sessionIdHeader && transports[sessionIdHeader]) {
    console.log('existing session');
    transport = transports[sessionIdHeader];
  } else if (!sessionIdHeader) {
    console.log('new session');
    // New session: create transport and server; do not consume request body here
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport!;
        // Optionally expire sessions later
        setTimeout(() => {
          if (transports[sessionId]) transports[sessionId].close();
        }, 10 * 60 * 1000);
      },
      // We enforce allowed hosts above. Disable SDK DNS rebinding protection to avoid duplicate checks.
      enableDnsRebindingProtection: false
    });

    transport.onclose = () => {
      if (transport?.sessionId) delete transports[transport.sessionId];
    };

    const server = new McpServer({ name: "doc-mcp", version: "0.1.0" });
    registerTools(server);
    await server.connect(transport);
  }

  if (!transport) {
    return res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" } });
  }

  // Let the transport handle this HTTP request
  return transport.handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`doc-mcp streamable HTTP listening on http://localhost:${PORT}/mcp`);
});

