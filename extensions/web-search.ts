import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";

// Web search and fetch tools for pi
// Uses DuckDuckGo HTML search (no API key) and Jina Reader (free, no API key) for fetching

const JINA_BASE = "https://r.jina.ai";
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function parseDDGResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  // DuckDuckGo HTML results are in <div class="result"> blocks
  const resultBlocks = html.split(/class="result\s/);

  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];

    // Extract URL from the result link
    const urlMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    // Extract title text
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:td|div|span)>/);

    if (urlMatch && titleMatch) {
      let url = urlMatch[1];
      // DDG wraps URLs in a redirect; extract the actual URL
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1]);
      }

      const title = titleMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim()
        : "";

      if (title && url.startsWith("http")) {
        results.push({ title, url, snippet });
      }
    }
  }

  return results;
}

export default function (pi: ExtensionAPI) {
  // web_search tool
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using DuckDuckGo. Returns titles, URLs, and snippets. Use web_fetch to read full page content from a result URL.",
    promptSnippet: "Search the web for information via DuckDuckGo",
    promptGuidelines: [
      "Use web_search when the user asks about current events, recent releases, documentation, or anything that may require up-to-date information from the internet.",
      "After searching, use web_fetch to read the full content of promising result URLs.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      max_results: Type.Optional(
        Type.Number({
          description: "Maximum results to return (default: 5, max: 10)",
          default: 5,
        })
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const maxResults = Math.min(params.max_results ?? 5, 10);

      const body = new URLSearchParams({ q: params.query });
      const response = await fetch(DDG_HTML_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: body.toString(),
        signal,
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed (status ${response.status})`);
      }

      const html = await response.text();
      const results = parseDDGResults(html, maxResults);

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No search results found." }],
          details: { results: [] },
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`
        )
        .join("\n\n");

      return {
        content: [{ type: "text", text: formatted }],
        details: { results },
      };
    },
  });

  // web_fetch tool
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch a web page and return its content as clean markdown/text. Uses Jina Reader for extraction (free, no API key). Good for reading documentation, articles, and web pages.",
    promptSnippet: "Fetch and read web page content as markdown via Jina Reader",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch and extract content from" }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const jinaUrl = `${JINA_BASE}/${params.url}`;

      const response = await fetch(jinaUrl, {
        headers: {
          Accept: "text/markdown",
          "User-Agent": "Mozilla/5.0 (compatible; pi-coding-agent)",
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${params.url} (status ${response.status})`
        );
      }

      let content = await response.text();

      // Truncate if too large
      const truncation = truncateHead(content, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      content = truncation.content;

      if (truncation.truncated) {
        content += `\n\n[Content truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
      }

      return {
        content: [{ type: "text", text: content || "No content extracted." }],
        details: { url: params.url, truncated: truncation.truncated },
      };
    },
  });
}
