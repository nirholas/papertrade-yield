---
title: API, CLI and SDK reference
description: The HTTP endpoints, response fields, caching and error codes, plus how to use the Papertrade SDK for protocol math.
order: 4
---

# API, CLI and SDK reference

Base URL: `https://papertrade-yield.pages.dev`. All endpoints are `GET`, return JSON and send `access-control-allow-origin: *`. The machine-readable description is [`/openapi.json`](/openapi.json) (OpenAPI 3.1). The MCP endpoint is documented separately on the [MCP](/docs/mcp/) page.

## GET /api/staking

Protocol staking state, mint curve, LP context and realized reward history. Cached for 60 seconds.

```bash
curl -s https://papertrade-yield.pages.dev/api/staking | jq '.protocol'
```

| Field | Meaning |
| --- | --- |
| `generatedAt` | ISO time the snapshot was built. |
| `source` | `apiBlock`, `historyAsOfMs` and `chainRead` (false when no RPC answered). |
| `protocol` | `paperSupply`, `paperStaked`, `stakedShare` (0 to 1), `accRewardPerShareRaw` (scaled by 1e27), `pendingRewardsUsd`, `minimumStakePaper`, `onchain`. |
| `mint` | `rate` (PAPER per $1 of loss basis), `trackedLpUsd`, `tailProgressUsd`, `onFlatBranch`, `curve` samples. |
| `lp` | Liquidity and queue figures in USD. |
| `yield` | `windows` (24h, 7d, 30d), hourly `series`, `cumulativeRewardsUsd`, `reconstructionError`, `method`, `pricing`. |

Each yield window has `label`, `hours`, `hoursCovered`, `complete`, `rewardsUsd`, `avgStakedPaper`, `rewardPerPaper` and the headline `usdPer1MPaperPerDay`.

## GET /api/staking/claims

USDC claimed on chain by stakers, bucketed per hour from `PaperStaking` `Claimed` logs. Cached for 5 minutes.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `hours` | integer | 24 | 1 to 72. Anything else returns `400`. |

Response: `hours`, `totalClaimedUsd`, `claims`, `uniqueClaimers`, `largestClaimUsd` and `buckets` (`t`, `claimedUsd`, `claims`).

## GET /api/staking/wallet

On-chain `pendingReward(address)` and `PAPER.balanceOf(address)` for one wallet. Cached for 15 seconds per address.

```bash
curl -s 'https://papertrade-yield.pages.dev/api/staking/wallet?address=0x0000000000000000000000000000000000000001'
```

Response: `address`, `pendingRewardRaw` (USDC, 18 decimals), `paperBalanceRaw` (PAPER, 18 decimals, unstaked only) and `readAt`. The staked amount and lifetime claims need the account history and are available through the MCP tool `get_wallet_staking`.

## GET /api/papertrade/{path}

A same-origin read proxy to the public Papertrade API, because the upstream sends no CORS headers. The web app uses it. It forwards the public read paths (`/state/`, `/query/`, `/queue-rank/`, `/relayer/health`, including the live SSE stream) and the POST routes that carry intents the user's wallet has already signed. Nothing else is proxied (`404 not_proxied`), and responses are never cached (`cache-control: no-store`). The proxy holds no keys and signs nothing.

## Errors

Errors are JSON: `{ "code": "...", "message": "..." }`.

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_address`, `invalid_hours` | The input failed validation. |
| 502 | `upstream_unavailable`, `rpc_unavailable` | Papertrade or HyperEVM did not answer. Retry shortly. |

## CLI

There is no standalone CLI. For local work use the npm scripts in the repository: `npm run dev:site` runs the whole site with Pages Functions on port 8795, and `npm run verify:signing` checks the intent wire format with a throwaway key against the live relayer (it must be refused).

## SDK

Protocol math comes from [`papertrade-sdk`](https://github.com/nirholas/papertrade-sdk): `paperMintRate`, `pendingStakingRewardRaw`, the contract addresses and the EIP-712 types. This project uses it instead of reimplementing the math. The shared read-only loaders in `src/data.ts` (`loadSnapshot`, `loadClaims`, `loadWalletStaking`) are what both the JSON API and the MCP tools call, so they always agree.
