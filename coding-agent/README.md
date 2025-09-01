# coding-agent

Minimal ReAct-style coding agent that uses MCP tools from the bundled `agent-mcp/` to scaffold a tiny frontend app.

## Prerequisites

- Node.js 18+
- Create a `.env` file in `coding-agent/` with your OpenAI key:

```bash
OPENAI_API_KEY=sk-...
```

## Start the MCP tools server (agent-mcp)

```bash
cd agent-mcp
npm install
npm run build
# Constrain file ops to a workspace dir
WORKSPACE_ROOT=/absolute/path/to/workspace npm start
```

## Run the agent (classic ReAct loop)

```bash
cd ..   # back to coding-agent
npm install
npm run build
OPENAI_API_KEY=... npm start -- --goal "build a todo app" --server http://localhost:4011/mcp
```

The agent will iteratively create `index.html`, `main.js`, and `styles.css` under the workspace. Paths sent to tools are relative; the server resolves them under `WORKSPACE_ROOT`.

## LangGraph variant (experimental)

This repository also includes a LangGraph-based implementation of the same ReAct loop.

- Uses `@langchain/langgraph` version `^0.2.15`.
- State wiring: `plan` emits `{ thought, action }`; `act` executes, appends an observation to `history`, increments `step`, and sets `done` when finishing.

Run it with:

```bash
OPENAI_API_KEY=... npm run start:graph -- --goal "build a snake game app" --server http://localhost:4011/mcp
```

The graph stops when the model returns the `finish` action or when `--max-steps` is reached (default 10).