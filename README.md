# papertrade-yield

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-0a8f5b?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/nirholas/papertrade-yield)
[![HyperEVM](https://img.shields.io/badge/HyperEVM-chain_999-0a8f5b?style=flat-square)](https://papertrade.xyz)
[![GitHub stars](https://img.shields.io/github/stars/nirholas/papertrade-yield?style=flat-square&color=0a8f5b)](https://github.com/nirholas/papertrade-yield/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/nirholas/papertrade-yield?style=flat-square&color=0a8f5b)](https://github.com/nirholas/papertrade-yield/commits/main)
[![MCP](https://img.shields.io/badge/MCP-streamable--http-0a8f5b?style=flat-square)](https://papertrade-yield.pages.dev/docs/mcp/)
[![Docs](https://img.shields.io/badge/docs-online-0a8f5b?style=flat-square)](https://papertrade-yield.pages.dev/docs/)
[![Unofficial](https://img.shields.io/badge/community-unofficial-lightgrey?style=flat-square)](#the-papertrade-toolkit)

[Live site](https://papertrade-yield.pages.dev) · [Docs](https://papertrade-yield.pages.dev/docs/) · [MCP](https://papertrade-yield.pages.dev/mcp) · [Issues](https://github.com/nirholas/papertrade-yield/issues) · [Discussions](https://github.com/nirholas/papertrade-yield/discussions) · [Papertrade](https://papertrade.xyz) · [Toolkit](#the-papertrade-toolkit)

Unofficial PAPER staking and yield dashboard for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x synthetic perps exchange on HyperEVM (chain 999). Not affiliated with Papertrade. High leverage can lose your whole margin.

PAPER is minted to traders who lose. Staked PAPER earns USDC from protocol revenue. This app shows what stakers actually earned, and lets you stake, unstake and claim from your own wallet. Reward distribution into the pool is run by the Papertrade relayer, not by users.

Live site: https://papertrade-yield.pages.dev . Docs: https://papertrade-yield.pages.dev/docs/ . MCP: https://papertrade-yield.pages.dev/mcp

## What you see

- Protocol: PAPER supply, staked amount and share, `accRewardPerShare`, mint rate and mint curve with today marked, LP and queue context, minimum stake.
- Reward history: USDC paid to stakers per hour, with realized yield over 24h, 7d and 30d. PAPER has no market price, so yield is shown as USDC per 1M PAPER per day. An optional implied APR uses a price you assume.
- Claims: USDC claimed on chain, from `PaperStaking` `Claimed` logs.
- Wallet: connect through EIP-6963 or paste an address (read-only). Held, staked, pending (live stream and on-chain), lifetime claimed, estimated daily earnings.
- Actions: Stake, Unstake and Claim through the SDK `PapertradeTrader`. Each has a confirmation dialog (amounts, nonce lane `paper`, deadline) and live intent status.
- Calculator: how much PAPER a given loss mints.

Yield figures are realized history, not forecasts. Method: hourly `paperRevenue` divided by mean staked PAPER (trapezoid), pro-rated to the window. The reconstruction is cross-checked against on-chain `accRewardPerShare` (about 3% drift).

## MCP server and AI connectors

A public, read-only MCP server (Streamable HTTP, no key) runs at `https://papertrade-yield.pages.dev/mcp`. Seven tools: `get_staking_stats`, `get_apr`, `get_yield_history`, `get_claims_activity`, `get_wallet_staking`, `project_rewards` and `plan_staking_action` (an unsigned plan only; your wallet signs, never the AI).

```
claude mcp add --transport http papertrade-yield https://papertrade-yield.pages.dev/mcp
codex mcp add papertrade-yield --url https://papertrade-yield.pages.dev/mcp
gemini mcp add --transport http papertrade-yield https://papertrade-yield.pages.dev/mcp
```

Cursor, VS Code, Windsurf, Zed, Cline, Goose, Continue, Claude Desktop, claude.ai, ChatGPT and the Claude and OpenAI APIs are covered in [Connect your AI](https://papertrade-yield.pages.dev/docs/connect-your-ai/). Discovery files: `/.well-known/mcp/server-card.json`, `/.well-known/agent-card.json`, `/.well-known/api-catalog`, `/openapi.json`, `/llms.txt`, `/llms-full.txt`. Registry metadata is in `server.json` and `glama.json`.

## Docs

Markdown sources are in `docs/` and render to `/docs/` with search, a table of contents and a raw `.md` twin per page. `npm run build:site` builds the app, the docs and every discovery file.

## Quick start

```
npm install
npm test
npm run typecheck
npm run dev:site      # http://localhost:8795
```

The SDK is installed from `github:nirholas/papertrade-sdk`.

## Architecture

- Browser app `site/app.ts` and landing behavior `site/landing.ts`, bundled by esbuild to `site/public`.
- MCP server: `site/functions/mcp.ts` over `site/functions/_lib/mcp.ts` and `src/mcp-tools.ts`; shared loaders in `src/data.ts`.
- Docs and discovery files: `docs/*.md` and `scripts/build-docs.mjs`.
- Pages Functions in `site/functions`: `/api/staking` (60 s cache), `/api/staking/claims` (5 min), `/api/staking/wallet` (15 s), `/api/papertrade/*` (same-origin proxy, Papertrade sends no CORS headers), `/mcp`, `/openapi.json`.
- Pure logic in `src/` (APR, curve, event decoding, claims aggregation, snapshot), tested against recorded real fixtures.
- Strict CSP: `default-src 'self'`, so chain reads go through the functions.

## Verifying signing

`npm run verify:signing` signs Stake, Unstake and Claim with a freshly generated throwaway key against the live relayer. The wire format is accepted through admission and refused for balance, and a wrong-type signature is refused with `403 unauthorized_intent`. No funds move.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `PAPERTRADE_API_URL` | no | Override the API base (default `https://exchange.papertrade.xyz`). See `.dev.vars.example`. |

No secrets are needed.

## Deploy

```
gh repo create nirholas/papertrade-yield --public --source . --push
npm run build:site && cd site && npx wrangler pages deploy --project-name papertrade-yield --branch main
```

## The Papertrade toolkit

Nine open-source building blocks for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x perps exchange on Hyperliquid HyperEVM. Use them together or on their own.

| Project | What it does |
|---|---|
| [papertrade-ai](https://github.com/nirholas/papertrade-ai) | MCP server and CLI: trade Papertrade from Claude, ChatGPT, Cursor and any MCP client |
| [papertrade-sdk](https://github.com/nirholas/papertrade-sdk) | Typed API client, live account stream, EIP-712 signing and verified settlement math. |
| [papertrade-terminal](https://github.com/nirholas/papertrade-terminal) | Non-custodial web trading terminal with charts, order ticket, funding and swaps. |
| [papertrade-analytics](https://github.com/nirholas/papertrade-analytics) | DefiLlama-style dashboard and JSON API: TVL, volume, OI, PAPER economics. |
| [papertrade-explorer](https://github.com/nirholas/papertrade-explorer) | Linkable wallet pages, decoded transactions and a live leaderboard. |
| [papertrade-liquidations](https://github.com/nirholas/papertrade-liquidations) | Liquidation map and closest-to-bust feed, recomputed with the verified formula. |
| **papertrade-yield** (this repo) | PAPER staking dashboard with realized USDC yield and wallet-signed actions. |
| [papertrade-alerts](https://github.com/nirholas/papertrade-alerts) | Know before the liquidation: Telegram, Discord and webhook alerts. |
| [papertrade-copytrade](https://github.com/nirholas/papertrade-copytrade) | Guard-railed copy-trading CLI. Dry run by default. |
| [papertrade-x402](https://github.com/nirholas/papertrade-x402) | Pay-per-call intelligence API for AI agents, paid in USDC on Solana or Base. |

## Contributing and support

- Found a bug or want a feature? [Open an issue](https://github.com/nirholas/papertrade-yield/issues/new/choose).
- Questions and show-and-tell: [Discussions](https://github.com/nirholas/papertrade-yield/discussions).
- Pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through [SECURITY.md](SECURITY.md).
- If this saved you time, a star helps other Papertrade traders and builders find it.

Built by [three.ws](https://three.ws).

## License

Apache-2.0, 2026, nirholas. Unofficial and not affiliated with Papertrade. High leverage can lose your whole margin.
