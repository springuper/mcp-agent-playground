#!/usr/bin/env node
import 'dotenv/config';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StateGraph, END, START } from "@langchain/langgraph";

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
    console.error("Usage: coding-agent (langgraph) --goal \"build a todo app\" [--server http://localhost:4011/mcp]");
    process.exit(2);
  }
  return { goal, serverUrl, maxSteps };
}

function extractJson(text: string): string | null {
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

type ToolAction =
  | { name: "read_file"; args: { path: string } }
  | { name: "write_file"; args: { path: string; content: string } }
  | { name: "execute_command"; args: { cmd: string; args?: string[] } }
  | { name: "finish"; args: { summary: string } };

type HistoryItem = { thought: string; action: string; observation: string };
type GState = { goal: string; serverUrl: string; maxSteps: number; step: number; done: boolean; history: HistoryItem[]; action: ToolAction | null; thought: string | null };

// Define explicit state channels using Annotations so LangGraph merges node updates
// Raw channels definition (simpler than Annotations for this demo)
type Channels = GState;

async function planNode(state: GState): Promise<GState> {
  console.log("PlanNode:", state);
  const hist = Array.isArray(state.history) ? state.history : [];
  const goal = state.goal || "";
  const messages = [
    { role: "system" as const, content: systemPrompt() },
    { role: "user" as const, content: `Goal: ${goal}\nHistory:${hist.map(h=>`\nThought: ${h.thought}\nAction: ${h.action}\nObservation: ${h.observation}`).join("")}\nNow produce the next JSON decision.` }
  ];
  const raw = await callOpenAI(messages);
  const json = extractJson(raw) ?? raw;
  let decision: { thought: string; action: ToolAction };
  try { decision = JSON.parse(json); }
  catch {
    const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
    if (s !== -1 && e !== -1 && e > s) decision = JSON.parse(raw.slice(s, e + 1)); else throw new Error(`Invalid model output: ${raw}`);
  }
  console.log("Decision:", decision);
  return { ...state, thought: decision.thought, action: decision.action };
}

async function actNode(state: GState): Promise<GState> {
  console.log("ActNode:", state);
  const url = state.serverUrl || process.env.AGENT_MCP_URL || "http://localhost:4011/mcp";
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "agent-runner", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  let observation = "";
  try {
    const a = state.action!;
    console.log("Action:", a);
    const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
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
    } else if (a.name === "finish") {
      observation = `finish: ${a.args.summary}`;
    } else {
      observation = `unknown action: ${(a as any).name}`;
    }
  } catch (e: any) {
    observation = `error: ${e?.message || String(e)}`;
  } finally {
    await client.close();
  }
  const hist = Array.isArray(state.history) ? state.history : [];
  const newHistory = hist.concat([{ thought: state.thought || "", action: JSON.stringify(state.action), observation }]);
  const done = state.action?.name === "finish" || (state.step ?? 0) + 1 >= (state.maxSteps ?? 10);
  return { ...state, history: newHistory, done, step: (state.step ?? 0) + 1 };
}

async function main() {
  const { goal, serverUrl, maxSteps } = parseArgs();
  const initial: GState = { goal, serverUrl, maxSteps, step: 0, done: false, history: [], thought: null, action: null };

  const builder = new StateGraph<GState>({
    channels: {
      goal: null,
      serverUrl: null,
      maxSteps: null,
      step: null,
      done: null,
      history: { default: () => [], reducer: (a: HistoryItem[], b: HistoryItem[]) => a.concat(b) },
      thought: null,
      action: null,
    }
  });
  builder.addNode("plan", async (s: GState) => {
    const res = await planNode(s);
    return { thought: res.thought, action: res.action } as Partial<GState>;
  });
  builder.addNode("act", async (s: GState) => {
    const res = await actNode(s);
    const last = res.history[res.history.length - 1];
    return { history: [last], done: res.done, step: res.step, thought: null, action: null } as Partial<GState>;
  });
  (builder as any).addEdge(START, "plan");
  (builder as any).addEdge("plan", "act");
  (builder as any).addConditionalEdges("act", (s: any) => (s.done ? END : "plan"));

  const app = builder.compile();
  const result = await app.invoke(initial);
  console.log("Done. Steps:", result.step, "History entries:", result.history.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

