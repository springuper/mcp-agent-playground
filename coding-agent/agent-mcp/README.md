# agent-mcp

Streamable HTTP MCP server exposing minimal coding tools:
- read_file(path)
- write_file(path, content)
- execute_command(cmd, args[])

Safety: workspace confinement, command allowlist, size limits, timeouts.

## Run

```bash
npm install
npm run build
npm start
# http://localhost:4011/mcp
```

Set `WORKSPACE_ROOT=/absolute/path` to control the workspace; defaults to process cwd.