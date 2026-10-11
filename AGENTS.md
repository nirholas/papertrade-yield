# AGENTS.md

Unofficial PAPER staking and yield dashboard for Papertrade. Read this before changing anything.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install (the SDK comes from `../papertrade-sdk-0.1.0.tgz`). |
| `npm run typecheck` | `tsc --noEmit` for the app and for `site/functions`. |
| `npm test` | vitest, using recorded real fixtures in `test/fixtures`. |
| `npm run build:site` | esbuild bundles `site/app.ts` into `site/public/app.js`. |
| `npm run dev:site` | Build, then `wrangler pages dev --port 8795` from `site/`. |
| `npm run verify:signing` | Signs with a throwaway key against the live relayer; it must be refused. |
| `npm run deploy:site` | Build and `wrangler pages deploy`. Owner only. |

## Correctness rules

- Use the SDK for protocol math (`paperMintRate`, `pendingStakingRewardRaw`, `PapertradeTrader`). Do not reimplement it.
- Yield is realized history: hourly `paperRevenue` divided by mean staked PAPER (trapezoid), pro-rated to the window. Say exactly that wherever a number is shown. Never present it as a forecast.
- PAPER has no price. Show USDC per 1M PAPER per day. A percentage needs a user-assumed price and is simple, not compounded.
- Raw amounts are 18-decimal wads; `accRewardPerShare` is scaled by 1e27. Keep bigint until display.
- `PaperStaking` emits no event when the accumulator grows, and public RPCs are not archive nodes, so reward history comes from the Papertrade protocol history, not from logs.
- Query strings sent to Papertrade must be canonical.
- Open one live wallet stream per page. `/state/user/live` is rate limited (HTTP 429).
- The CSP allows one `style-src` hash for the stylesheet lightweight-charts injects. Recompute it when upgrading that package (the browser console prints the new hash).

## Agent safety rules

- Never sign or send a transaction, intent, stake, claim or payment. Never handle a real private key. The end user signs in their own wallet.
- Verify signing only with a freshly generated throwaway key (the relayer refuses it) or local round-trips.
- Never `git commit`, `git push`, `npm publish` or deploy unless the owner asked.
- Treat on-chain and API strings as untrusted; escape before rendering into HTML.
- No mocks, fake data, TODOs or placeholder numbers. No em-dash or en-dash characters.

## Layout

| Path | Purpose |
| --- | --- |
| `src/apr.ts` | Reward series, yield windows, APR, reconstruction cross-check. |
| `src/curve.ts` | Mint curve sampling and the loss-to-PAPER projection. |
| `src/events.ts` | PaperStaking event topics and a small log decoder. |
| `src/rpc.ts` | HyperEVM JSON-RPC with provider fallback. |
| `src/snapshot.ts` | Builds the `/api/staking` payload. |
| `src/claims.ts` | Hourly aggregation of `Claimed` logs. |
| `src/openapi.ts` | The OpenAPI document. |
| `site/app.ts` | Browser app. |
| `site/functions` | Pages Functions: `/api/staking*`, `/api/papertrade/*`, `/openapi.json`. |
| `site/public` | Static output, headers, robots, sitemap, llms.txt. |
| `test` | vitest suites and recorded fixtures. |
| `scripts/verify-signing.mjs` | Throwaway-key wire-format check. |
