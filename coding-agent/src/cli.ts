#!/usr/bin/env node
import 'dotenv/config';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

type Args = { goal: string; serverUrl: string; maxSteps: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let goal = "";
  let serverUrl = process.env.AGENT_MCP_URL || "http://localhost:4011/mcp";
  let maxSteps = 10;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--goal") goal = argv[++i] || goal;
    else if (a === "--server") serverUrl = argv[++i] || serverUrl;
    else if (a === "--max-steps") maxSteps = parseInt(argv[++i] || "10", 10);
  }
  if (!goal) {
    console.error("Usage: coding-agent --goal \"build a todo app\" [--server http://localhost:4011/mcp]");
    process.exit(2);
  }
  return { goal, serverUrl, maxSteps };
}

type ToolAction =
  | { name: "read_file"; args: { path: string } }
  | { name: "write_file"; args: { path: string; content: string } }
  | { name: "execute_command"; args: { cmd: string; args?: string[] } }
  | { name: "finish"; args: { summary: string } };

type ModelDecision = { thought: string; action: ToolAction };

function extractJson(text: string): string | null {
  // try to find first JSON block; support fenced code blocks
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return null;
}

function extractCode(text: string): string {
  const fenced = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (fenced) return fenced[1];
  return text;
}

async function callOpenAI(messages: { role: "system" | "user" | "assistant"; content: string }[], model = process.env.OPENAI_MODEL || "gpt-4o-mini") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      // Ask OpenAI to return a strict JSON object
      response_format: { type: "json_object" }
    })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return content as string;
}

function systemPrompt(): string {
  return (
    "You are a minimal coding agent following a ReAct loop (Thought -> Action -> Observation).\n" +
    "Goal: build small frontend apps (vanilla HTML/CSS/JS).\n" +
    "You can ONLY use these tools: read_file(path), write_file(path, content), execute_command(cmd,args).\n" +
    "Always use RELATIVE paths (e.g., index.html, main.js, styles.css) under the workspace root configured by the tool server.\n" +
    "Output STRICT JSON with keys thought and action; action has name and args. Example: {\"thought\":\"...\",\"action\":{\"name\":\"write_file\",\"args\":{\"path\":\"index.html\",\"content\":\"<html>...\"}}}.\n" +
    "Use minimal, working code (no frameworks).\n" +
    "Stop by returning action name 'finish' with a short summary when the goal appears satisfied."
  );
}

async function proposeNext(goal: string, history: { thought: string; action: string; observation: string }[]) {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
  messages.push({ role: "system", content: systemPrompt() });
  let userContent = `Goal: ${goal}\nHistory:`;
  for (const h of history.slice(-8)) {
    userContent += `\nThought: ${h.thought}\nAction: ${h.action}\nObservation: ${h.observation}`;
  }
  userContent += "\nNow produce the next JSON decision.";
  messages.push({ role: "user", content: userContent });
  const raw = await callOpenAI(messages);
  const json = extractJson(raw) ?? raw;
  let decision: ModelDecision;
  try {
    decision = JSON.parse(json) as ModelDecision;
  } catch (e) {
    // Fallback: try to coerce typical non-JSON deviations (trailing text)
    const braceStart = raw.indexOf("{");
    const braceEnd = raw.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      try {
        decision = JSON.parse(raw.slice(braceStart, braceEnd + 1)) as ModelDecision;
        return decision;
      } catch {}
    }
    throw new Error(`Failed to parse model JSON: ${raw}`);
  }
  return decision;
}

async function reactLoop(goal: string, serverUrl: string, maxSteps: number) {
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  const client = new Client({ name: "agent-runner", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });

    const history: { thought: string; action: string; observation: string }[] = [];
    for (let step = 1; step <= maxSteps; step++) {
      console.log(`\nStep ${step} — proposing next action`);
      const decision = await proposeNext(goal, history);
      console.log("Thought:", decision.thought);
      console.log("Action:", decision.action);
      const a = decision.action;
      if (a.name === "finish") {
        console.log("Finish:", a.args?.summary || "done");
        break;
      }
      let observation = "";
      try {
        if (a.name === "read_file") {
          const res = await call("read_file", { path: a.args.path, base: "." });
          const text = (res as any)?.result?.content?.[0]?.text ?? "";
          observation = `read ${a.args.path} (${text.length} chars)`;
        } else if (a.name === "write_file") {
          const content = extractCode(a.args.content);
          await call("write_file", { path: a.args.path, content, base: "." });
          observation = `wrote ${a.args.path} (${content.length} chars)`;
        } else if (a.name === "execute_command") {
          const res = await call("execute_command", { cmd: a.args.cmd, args: a.args.args ?? [], base: "." });
          const t = (res as any)?.result?.content?.[0]?.text ?? "";
          observation = `exec ${a.args.cmd}: ${t.slice(0, 200)}`;
        } else {
          observation = `unknown action: ${(a as any).name}`;
        }
      } catch (e: any) {
        observation = `error: ${e?.message || String(e)}`;
      }
      console.log("Observation:", observation);
      history.push({ thought: decision.thought, action: JSON.stringify(a), observation });
    }
  } finally {
    await client.close();
  }
}

(async () => {
  const { goal, serverUrl, maxSteps } = parseArgs();
  console.log("Goal:", goal);
  await reactLoop(goal, serverUrl, maxSteps);
})();

