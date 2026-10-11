# Changelog

## 0.2.0 - 2026-10-11

- MCP server at `/mcp` (Streamable HTTP, stateless, JSON-RPC 2.0, batches, SSE reply, CORS, per-IP rate limit) with seven read-only tools: `get_staking_stats`, `get_apr`, `get_yield_history`, `get_claims_activity`, `get_wallet_staking`, `project_rewards` and `plan_staking_action` (an unsigned stake, unstake or claim plan only).
- Shared read-only data loaders in `src/data.ts` now back both the JSON API and the MCP tools.
- Docs site at `/docs/` with sidebar, table of contents, full-text search, copy buttons, dark and light themes, and a raw markdown twin for every page. Includes a Connect your AI guide for Claude, Codex, ChatGPT, Gemini, Cursor, VS Code, Windsurf, Zed, Cline, Goose and Continue.
- Agent discovery: MCP server card, A2A agent card, RFC 9727 API catalog, `llms.txt`, `llms-full.txt`, robots with Content-Signal and explicit AI crawler allows, sitemap with docs, `Link` headers on the home page, `server.json` and `glama.json` for MCP registries. The OpenAPI document now describes `/mcp` and the discovery files.
- Landing page: feature grid, works-with strip, connect-your-AI tabs, live tool list from `/mcp`, quickstart, and a footer with Docs, GitHub, llms.txt and MCP.
- Embeddable in Papertrade OS: `?embed=1` shows only the product, an Open in Papertrade OS link, and `frame-ancestors` on the app route allows the OS host and `*.pages.dev`.
- Tests for the MCP plumbing, the tools and the docs and discovery generator.

## 0.1.0 - 2026-10-10

- Protocol view: PAPER supply, staked and staked share, accRewardPerShare (API and on-chain cross-check), mint rate from the SDK `paperMintRate`, the mint curve with today marked, LP and queue context, minimum stake.
- Reward history and realized yield: USDC paid to stakers per hour from the Papertrade protocol history, windows for 24h, 7d and 30d with the method stated, and yield quoted as USDC per 1M PAPER per day because PAPER has no price. Optional implied APR at a user-assumed price.
- On-chain claims panel from PaperStaking `Claimed` logs.
- Wallet view over EIP-6963 or a pasted read-only address: PAPER held, staked, pending rewards from the live stream and from `pendingReward`, lifetime claimed, estimated daily earnings.
- Wallet-signed Stake, Unstake and Claim through `PapertradeTrader`, each with a confirmation dialog and live intent status.
- Loss to PAPER calculator.
- Pages Functions `/api/staking`, `/api/staking/claims`, `/api/staking/wallet`, `/openapi.json`.
- Tests with recorded real fixtures for the APR math, event decoding, claims, curve and pending-reward math.
