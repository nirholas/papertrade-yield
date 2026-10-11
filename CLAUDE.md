# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first. It holds the commands, correctness rules and safety rules, and they apply to Claude Code unchanged.

Quick orientation:

- Data layer: `src/data.ts` (shared loaders), used by both `site/functions/api/*` and the MCP tools in `src/mcp-tools.ts`. Change a number once, in the loader.
- MCP plumbing: `site/functions/_lib/mcp.ts`. Tool definitions: `src/mcp-tools.ts`. The docs, server card, agent card, `llms.txt` and the OpenAPI tool list are generated from them by `scripts/build-docs.mjs`, so never hand-edit generated output under `site/public/docs/` or `site/public/.well-known/`.
- After editing tools or `docs/*.md`, run `npm run build:site`, `npm run typecheck` and `npm test`.
- No em-dash or en-dash characters anywhere, no emojis in copy, no mocks or placeholder data.
- This server is read-only. A tool must never sign, send, swap, bridge, mint or pay; money-moving tools return an unsigned plan only.
