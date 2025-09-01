import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/Users/chun/Repo/mcp-agent-demo/coding-agent/playground';
const ROOT = path.resolve(WORKSPACE_ROOT);
const MAX_FILE_BYTES = 256 * 1024;
const CMD_ALLOWLIST = new Set(["node", "npm", "npx"]);
const EXEC_TIMEOUT_MS = 30_000;

function resolveBase(base?: string) {
  let br = ROOT;
  if (base) {
    if (path.isAbsolute(base)) {
      const nb = path.normalize(base);
      const safeRoot = ROOT + path.sep;
      if (!(nb === ROOT || nb.startsWith(safeRoot))) throw new Error("Base escapes workspace");
      br = nb;
    } else {
      const nb = path.normalize(path.join(ROOT, base));
      const safeRoot = ROOT + path.sep;
      if (!(nb === ROOT || nb.startsWith(safeRoot))) throw new Error("Base escapes workspace");
      br = nb;
    }
  }
  return br;
}

function toSafePath(input: string, base?: string) {
  const br = resolveBase(base);
  const p = path.isAbsolute(input)
    ? path.normalize(input)
    : path.normalize(path.join(br, input));
  const safeRoot = ROOT + path.sep;
  if (!(p === ROOT || p.startsWith(safeRoot))) {
    throw new Error("Path escapes workspace");
  }
  if (path.basename(p).startsWith(".")) {
    throw new Error("Dotfiles are not allowed");
  }
  return p;
}

export function registerAgentTools(server: McpServer) {
  // read_file
  server.registerTool(
    "read_file",
    {
      title: "Read File",
      description: "Read a text file within the workspace",
      inputSchema: { path: z.string().min(1), base: z.string().optional() }
    },
    async ({ path: rel, base }) => {
      const p = toSafePath(rel, base);
      const stat = await fsp.stat(p);
      if (stat.size > MAX_FILE_BYTES) throw new Error("File too large");
      const text = await fsp.readFile(p, "utf8");
      return { content: [{ type: "text", text }] };
    }
  );

  // write_file
  server.registerTool(
    "write_file",
    {
      title: "Write File",
      description: "Create or overwrite a text file within the workspace",
      inputSchema: { path: z.string().min(1), content: z.string(), base: z.string().optional() }
    },
    async ({ path: rel, content, base }) => {
      const p = toSafePath(rel, base);
      const dir = path.dirname(p);
      await fsp.mkdir(dir, { recursive: true });
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("Content too large");
      await fsp.writeFile(p, content, "utf8");
      return { content: [{ type: "text", text: `wrote ${rel}` }] };
    }
  );

  // execute_command
  server.registerTool(
    "execute_command",
    {
      title: "Execute Command",
      description: "Run an allowed command with arguments in workspace",
      inputSchema: { cmd: z.string(), args: z.array(z.string()).default([]), base: z.string().optional() }
    },
    async ({ cmd, args, base }) => {
      if (!CMD_ALLOWLIST.has(cmd)) throw new Error("Command not allowed");
      const cwd = resolveBase(base);
      const child = spawn(cmd, args, { cwd, env: process.env });
      let out = "";
      let err = "";
      const done = new Promise<{ code: number | null }>((resolve) => {
        child.stdout.on("data", (d) => (out += d.toString()))
        child.stderr.on("data", (d) => (err += d.toString()))
        child.on("close", (code) => resolve({ code }))
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), EXEC_TIMEOUT_MS);
      const { code } = await done;
      clearTimeout(timer);
      return {
        content: [{ type: "text", text: JSON.stringify({ code, stdout: out.slice(-4000), stderr: err.slice(-4000) }) }]
      };
    }
  );
}

