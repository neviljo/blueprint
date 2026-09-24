import { tavily } from "@tavily/core";
import { tool } from "ai";
import { z } from "zod";

import { getTavilyApiKey } from "./config.js";

export function tavilySearchTools() {
  const client = tavily({ apiKey: getTavilyApiKey() });
  return {
    tavilySearch: tool({
      description:
        "Search the live web for current facts, latest stacks, products, and trends. Skip it for generic diagram edits.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query under 400 characters"),
      }),
      execute: async ({ query }) => {
        const response = await client.search(query, {
          searchDepth: "advanced",
          maxResults: 5,
        });
        return {
          query: response.query,
          results: response.results.map((item) => ({
            title: item.title,
            url: item.url,
            content: item.content,
          })),
        };
      },
    }),
  };
}
