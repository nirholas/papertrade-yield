# papertrade-yield

Unofficial PAPER staking and yield dashboard for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x synthetic perps exchange on HyperEVM (chain 999). Not affiliated with Papertrade. High leverage can lose your whole margin.

PAPER is minted to traders who lose. Staked PAPER earns USDC from protocol revenue. This app shows what stakers actually earned, and lets you stake, unstake and claim from your own wallet. Reward distribution into the pool is run by the Papertrade relayer, not by users.

Live site: https://papertrade-yield.pages.dev (after deploy).

## What you see

- Protocol: PAPER supply, staked amount and share, `accRewardPerShare`, mint rate and mint curve with today marked, LP and queue context, minimum stake.
- Reward history: USDC paid to stakers per hour, with realized yield over 24h, 7d and 30d. PAPER has no market price, so yield is shown as USDC per 1M PAPER per day. An optional implied APR uses a price you assume.
- Claims: USDC claimed on chain, from `PaperStaking` `Claimed` logs.
- Wallet: connect through EIP-6963 or paste an address (read-only). Held, staked, pending (live stream and on-chain), lifetime claimed, estimated daily earnings.
- Actions: Stake, Unstake and Claim through the SDK `PapertradeTrader`. Each has a confirmation dialog (amounts, nonce lane `paper`, deadline) and live intent status.
- Calculator: how much PAPER a given loss mints.

Yield figures are realized history, not forecasts. Method: hourly `paperRevenue` divided by mean staked PAPER (trapezoid), pro-rated to the window. The reconstruction is cross-checked against on-chain `accRewardPerShare` (about 3% drift).

## Quick start

```
npm install
npm test
npm run typecheck
npm run dev:site      # http://localhost:8795
```

The SDK is installed from `../papertrade-sdk-0.1.0.tgz` until it is on npm.

## Architecture

- Browser app `site/app.ts`, bundled by esbuild to `site/public/app.js`.
- Pages Functions in `site/functions`: `/api/staking` (60 s cache), `/api/staking/claims` (5 min), `/api/staking/wallet` (15 s), `/api/papertrade/*` (same-origin proxy, Papertrade sends no CORS headers), `/openapi.json`.
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
npm run build:site && cd site && npx wrangler pages deploy
```

## Related

[papertrade-sdk](https://github.com/nirholas/papertrade-sdk), [papertrade-ai](https://github.com/nirholas/papertrade-ai), [papertrade-terminal](https://github.com/nirholas/papertrade-terminal), [papertrade-analytics](https://github.com/nirholas/papertrade-analytics), [papertrade-explorer](https://github.com/nirholas/papertrade-explorer), [papertrade-x402](https://github.com/nirholas/papertrade-x402), [papertrade-liquidations](https://github.com/nirholas/papertrade-liquidations), [papertrade-alerts](https://github.com/nirholas/papertrade-alerts), [papertrade-copytrade](https://github.com/nirholas/papertrade-copytrade).

## License

MIT, 2026, nirholas. Unofficial and not affiliated with Papertrade. High leverage can lose your whole margin.
