import { tavily } from "@tavily/core";
import { jsonSchema, tool } from "ai";

import { getTavilyApiKey } from "./config.js";

export function tavilySearchTools() {
  const client = tavily({ apiKey: getTavilyApiKey() });
  return {
    tavilySearch: tool({
      description:
        "Search the live web. Call this when you need current facts, versions, products, news, or trends. Skip it for generic diagram edits or questions already answered by the diagram dump.",
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Short search query, under 400 characters",
          },
        },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: async ({ query }) => {
        const q = String(query ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
        if (!q) {
          return { query: "", results: [], error: "Empty query" };
        }
        try {
          const response = await client.search(q, {
            searchDepth: "basic",
            maxResults: 5,
            includeAnswer: true,
          });
          return {
            query: response.query ?? q,
            answer: response.answer ?? null,
            results: (response.results ?? []).map((item) => ({
              title: item.title,
              url: item.url,
              content: item.content,
            })),
          };
        } catch (error) {
          return {
            query: q,
            results: [],
            error: error instanceof Error ? error.message : "Tavily search failed",
          };
        }
      },
    }),
  };
}
