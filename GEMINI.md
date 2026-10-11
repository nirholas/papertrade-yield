# GEMINI.md

Follow [AGENTS.md](AGENTS.md) for commands, correctness rules and safety rules.

- Shared read-only loaders live in `src/data.ts`; MCP tools in `src/mcp-tools.ts`; MCP plumbing in `site/functions/_lib/mcp.ts`.
- Docs are `docs/*.md`. `npm run build:site` renders them and regenerates the discovery files (server card, agent card, `llms.txt`, sitemap). Do not hand-edit generated files.
- Gate before finishing: `npm run typecheck`, `npm test`, `npm run build:site`.
- Never sign or send anything on a user's behalf. No em-dash or en-dash characters.
