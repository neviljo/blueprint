import { tavily } from "@tavily/core";
import { jsonSchema, tool } from "ai";

import { getTavilyApiKey } from "./config.js";

export function tavilySearchTools() {
  const client = tavily({ apiKey: getTavilyApiKey() });
  return {
    tavilySearch: tool({
      description:
        "Search the live web for current facts, latest stacks, products, and trends. Skip it for generic diagram edits.",
      // Plain JSON Schema: Gemini rejects Zod 4 output ($schema / extra keywords).
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query under 400 characters",
          },
        },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: async ({ query }) => {
        try {
          const response = await client.search(query.slice(0, 400), {
            searchDepth: "basic",
            maxResults: 5,
          });
          return {
            query: response.query ?? query,
            results: (response.results ?? []).map((item) => ({
              title: item.title,
              url: item.url,
              content: item.content,
            })),
          };
        } catch (error) {
          return {
            query,
            results: [],
            error: error instanceof Error ? error.message : "Tavily search failed",
          };
        }
      },
    }),
  };
}
