# Weather MCP Server

This MCP server provides two tools for China cities:

- getWeather(chinaCity: string)
- getAlerts(chinaCity: string)

It uses Open-Meteo geocoding (filtered to CN) and forecast. Alerts are derived heuristically from precipitation, wind, and thunderstorm codes within the next 24 hours.

## Requirements

- Node.js 18+

## Install & Build

```bash
npm install
npm run build
```

## Run (stdio)

```bash
npm start
```

Inspect with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node ./dist/index.js
```

## Claude Desktop config example

```json
{
  "mcpServers": {
    "weather-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/weather-mcp/dist/index.js"]
    }
  }
}
```

## Notes

- Geocoding restricted using `countryCode=CN`.
- Alerts are best-effort, not official warnings.