import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type GeocodingResult = {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country_code: string;
    admin1?: string;
  }>;
};

async function geocodeChinaCity(city: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "zh");
  url.searchParams.set("countryCode", "CN");

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as GeocodingResult;
  const first = data.results?.[0];
  if (!first) return null;
  return { lat: first.latitude, lon: first.longitude, label: `${first.name}${first.admin1 ? `, ${first.admin1}` : ""}` };
}

async function fetchWeatherSummary(lat: number, lon: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "precipitation",
    "weather_code"
  ].join(","));
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  return res.json();
}

async function fetchWeatherAlerts(lat: number, lon: number) {
  // Open-Meteo general forecast does not include alerts globally.
  // As a simple proxy, we derive a basic alert when heavy precipitation or extreme wind is forecast in the next hours.
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("hourly", [
    "precipitation",
    "wind_speed_10m",
    "weather_code"
  ].join(","));
  url.searchParams.set("forecast_hours", "24");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alerts API error: ${res.status}`);
  const data = await res.json();

  const hours: string[] = data.hourly?.time ?? [];
  const precip: number[] = data.hourly?.precipitation ?? [];
  const wind: number[] = data.hourly?.wind_speed_10m ?? [];
  const wcode: number[] = data.hourly?.weather_code ?? [];

  const alerts: Array<{ level: "advisory" | "watch" | "warning"; type: string; details: string; at: string } > = [];

  for (let i = 0; i < hours.length; i++) {
    const p = precip[i] ?? 0;
    const w = wind[i] ?? 0;
    const code = wcode[i] ?? 0;
    if (p >= 10) {
      alerts.push({ level: "warning", type: "heavy_precipitation", details: `Precipitation ${p} mm`, at: hours[i] });
    } else if (p >= 5) {
      alerts.push({ level: "watch", type: "moderate_precipitation", details: `Precipitation ${p} mm`, at: hours[i] });
    }
    if (w >= 50) {
      alerts.push({ level: "warning", type: "high_wind", details: `Wind ${w} km/h`, at: hours[i] });
    } else if (w >= 30) {
      alerts.push({ level: "advisory", type: "strong_breeze", details: `Wind ${w} km/h`, at: hours[i] });
    }
    if ([95, 96, 99].includes(code)) {
      alerts.push({ level: "warning", type: "thunderstorm", details: `Weather code ${code}`, at: hours[i] });
    }
  }

  // Deduplicate by hour+type keeping highest level
  const byKey = new Map<string, { level: "advisory" | "watch" | "warning"; type: string; details: string; at: string }>();
  for (const a of alerts) {
    const key = `${a.at}-${a.type}`;
    const existing = byKey.get(key);
    const rank = (l: string) => (l === "warning" ? 3 : l === "watch" ? 2 : 1);
    if (!existing || rank(a.level) > rank(existing.level)) byKey.set(key, a);
  }

  return Array.from(byKey.values());
}

async function main() {
  const server = new McpServer({
    name: "weather-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "getWeather",
    {
      title: "Get Weather (China City)",
      description: "Get current weather and hourly preview for a China city",
      inputSchema: { chinaCity: z.string().min(1).describe("City name in China (中文或拼音)" ) }
    },
    async ({ chinaCity }) => {
      const loc = await geocodeChinaCity(chinaCity);
      if (!loc) {
        return { content: [{ type: "text", text: `City not found in China: ${chinaCity}` }] };
      }
      const data = await fetchWeatherSummary(loc.lat, loc.lon);
      const current = data.current ?? {};
      const lines: string[] = [];
      lines.push(`Location: ${loc.label} (${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)})`);
      if (current) {
        lines.push(
          `Now: ${current.temperature_2m ?? "?"}°C, RH ${current.relative_humidity_2m ?? "?"}% , ` +
            `Feels ${current.apparent_temperature ?? "?"}°C, Wind ${current.wind_speed_10m ?? "?"} km/h`
        );
      }
      const previewCount = Math.min(6, data.hourly?.time?.length ?? 0);
      if (previewCount > 0) {
        lines.push("Next hours:");
        for (let i = 0; i < previewCount; i++) {
          const t = data.hourly.time[i];
          const temp = data.hourly.temperature_2m?.[i];
          const pr = data.hourly.precipitation?.[i];
          lines.push(`- ${t}: ${temp}°C, precip ${pr} mm`);
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "getAlerts",
    {
      title: "Get Alerts (Derived)",
      description: "Derive simple alerts from forecast for a China city",
      inputSchema: { chinaCity: z.string().min(1).describe("City name in China (中文或拼音)") }
    },
    async ({ chinaCity }) => {
      const loc = await geocodeChinaCity(chinaCity);
      if (!loc) {
        return { content: [{ type: "text", text: `City not found in China: ${chinaCity}` }] };
      }
      const derived = await fetchWeatherAlerts(loc.lat, loc.lon);
      if (derived.length === 0) {
        return { content: [{ type: "text", text: `No derived alerts in next 24h for ${loc.label}.` }] };
      }
      const header = `Derived alerts for ${loc.label} (${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}):`;
      const body = derived
        .slice(0, 20)
        .map(a => `- [${a.level}] ${a.type} at ${a.at} — ${a.details}`)
        .join("\n");
      return { content: [{ type: "text", text: `${header}\n${body}` }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

