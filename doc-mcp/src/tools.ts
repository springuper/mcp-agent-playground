import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listLibraryIds, searchLibrary, LibraryId } from "./data.js";

export function registerTools(server: McpServer) {
  server.registerTool(
    "listLibraries",
    {
      title: "List Supported Libraries",
      description: "Returns the identifiers of supported documentation libraries",
      inputSchema: {}
    },
    async () => {
      const libs = listLibraryIds();
      return { content: [{ type: "text", text: JSON.stringify(libs) }] };
    }
  );

  server.registerTool(
    "queryLibraryDoc",
    {
      title: "Query Library Documentation",
      description: "Returns relevant docs for a specific library",
      inputSchema: {
        keyword: z.string().min(1).describe("Search keyword"),
        library: z.enum(["node", "typescript", "react"]).describe("Library id")
      }
    },
    async ({ keyword, library }) => {
      // Brief artificial delay to simulate processing
      await new Promise((r) => setTimeout(r, 300));
      const results = searchLibrary(library as LibraryId, keyword);
      await new Promise((r) => setTimeout(r, 200));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ library, keyword, results }, null, 2)
          }
        ]
      };
    }
  );
}

