#!/usr/bin/env node
/*
  Simple curl-based Streamable HTTP MCP client demo.
  - Sends initialize
  - Lists tools
  - Calls listLibraries
  - Calls queryLibraryDoc
  Prints full response headers and bodies for each request.
*/
import { spawnSync } from "node:child_process";

const ENDPOINT = process.env.MCP_URL || "http://localhost:4001/mcp";

function runCurl(jsonBody, extraHeaders = []) {
  const args = [
    "-sS",
    "-D",
    "-", // write response headers to stdout
    "-o",
    "-", // write body to stdout (after headers)
    "-X",
    "POST",
    "-H",
    "Content-Type: application/json",
    "-H",
    "Accept: application/json, text/event-stream",
  ];
  for (const h of extraHeaders) {
    args.push("-H", h);
  }
  args.push("--data", JSON.stringify(jsonBody));
  args.push(ENDPOINT);

  const res = spawnSync("curl", args, { encoding: "utf8" });
  if (res.error) throw res.error;
  const combined = res.stdout || "";
  const headerEnd = combined.indexOf("\r\n\r\n");
  let headersText = "";
  let bodyText = combined;
  if (headerEnd !== -1) {
    headersText = combined.slice(0, headerEnd);
    bodyText = combined.slice(headerEnd + 4);
  }
  return { headersText, bodyText, status: res.status, stderr: res.stderr };
}

function extractSessionId(headersText) {
  const lines = headersText.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (name === "mcp-session-id") return val;
  }
  return undefined;
}

function prettyPrint(title, headers, body) {
  console.log(`\n===== ${title} — RESPONSE HEADERS =====`);
  console.log(headers);
  console.log(`\n===== ${title} — RESPONSE BODY =====`);
  console.log(body);
}

(async () => {
  // 1) initialize
  const initBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      clientInfo: { name: "curl-demo", version: "0.1.0" },
      capabilities: {}
    }
  };
  const initRes = runCurl(initBody);
  prettyPrint("initialize", initRes.headersText, initRes.bodyText);
  const sessionId = extractSessionId(initRes.headersText);
  if (!sessionId) {
    console.error("Could not find MCP-Session-Id in response headers. Exiting.");
    process.exit(1);
  }
  console.log(`\n>>> Using MCP-Session-Id: ${sessionId}`);

  const sidHeader = `MCP-Session-Id: ${sessionId}`;

  // 1b) notifications/initialized
  const initializedNote = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  };
  const initNoteRes = runCurl(initializedNote, [sidHeader]);
  prettyPrint("notifications/initialized", initNoteRes.headersText, initNoteRes.bodyText);

  // 2) tools/list
  const listToolsBody = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };
  const listToolsRes = runCurl(listToolsBody, [sidHeader]);
  prettyPrint("tools/list", listToolsRes.headersText, listToolsRes.bodyText);

  // 3) tools/call listLibraries
  const callListLibraries = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "listLibraries",
      arguments: {}
    }
  };
  const callListRes = runCurl(callListLibraries, [sidHeader]);
  prettyPrint("tools/call listLibraries", callListRes.headersText, callListRes.bodyText);

  // 4) tools/call queryLibraryDoc
  const callQuery = {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "queryLibraryDoc",
      arguments: {
        keyword: "hooks",
        library: "react"
      }
    }
  };
  const callQueryRes = runCurl(callQuery, [sidHeader]);
  prettyPrint("tools/call queryLibraryDoc", callQueryRes.headersText, callQueryRes.bodyText);
})();

