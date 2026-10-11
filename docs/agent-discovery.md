---
title: Agent discovery
description: Every machine-readable file this site serves so agents and crawlers can find the MCP server, the API and the docs.
order: 7
---

# Agent discovery

All of these are real files with the right content type, not the app shell.

| Path | Content type | What it is |
| --- | --- | --- |
| `/mcp` | `application/json` | The MCP server (Streamable HTTP). |
| `/.well-known/mcp/server-card.json` | `application/json` | MCP server card (SEP-1649 shape): server info, transport endpoint, capabilities and the tool list. |
| `/.well-known/mcp.json` | `application/json` | Alias of the server card. |
| `/.well-known/agent-card.json` | `application/json` | A2A agent card with skills mapped from the MCP tools. |
| `/.well-known/agent.json` | `application/json` | Alias of the agent card. |
| `/.well-known/api-catalog` | `application/linkset+json` | RFC 9727 API catalog linking the OpenAPI document, the MCP endpoint, the docs and `llms.txt`. |
| `/openapi.json` | `application/json` | OpenAPI 3.1 for the JSON API and `/mcp`. |
| `/llms.txt` | `text/plain` | A short index of the site for language models, listing every docs page and its `.md` twin. |
| `/llms-full.txt` | `text/plain` | The full docs inlined in one file. |
| `/docs/*.md` | `text/markdown` | Every docs page as raw markdown at the page path plus `.md`. |
| `/robots.txt` | `text/plain` | Crawl rules with a Content-Signal and explicit allows for the main AI crawlers. |
| `/sitemap.xml` | `application/xml` | All pages, including docs. |

The home page also sends `Link` response headers: `rel="service-desc"` for the OpenAPI document, `rel="api-catalog"` for the catalog and `rel="mcp"` for the MCP endpoint.

## Generated, not hand-written

The server card, agent card, API catalog, `llms.txt`, `llms-full.txt` and the sitemap are generated at build time from the tool definitions in `src/mcp-tools.ts` and the markdown in `docs/`. The tool list in the cards therefore cannot drift from what `/mcp` serves. Run `npm run build:site` to regenerate them.

## Crawler policy

`robots.txt` allows `GPTBot`, `ClaudeBot`, `Claude-User`, `OAI-SearchBot`, `Google-Extended` and `PerplexityBot`, and declares `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. The data shown is public Papertrade data and the code is Apache-2.0.

## Registry metadata

`server.json` at the repository root describes the server for the official MCP registry under the name `io.github.nirholas/papertrade-yield`, with a streamable-http remote pointing at the live `/mcp`. `glama.json` carries the Glama listing metadata. Publishing to either is a manual owner step.
