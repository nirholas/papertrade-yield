---
name: read-paper-staking-yield
description: Read Papertrade PAPER staking state, realized USDC yield, claims and one wallet's position, project rewards, and build unsigned stake, unstake or claim plans through a hosted read-only MCP server.
---

# PAPER staking and yield

Papertrade is a 1000x synthetic perps exchange on HyperEVM (chain 999). This repo is an unofficial community tool. PAPER stakers earn realized USDC. The dashboard at https://papertrade-yield.pages.dev runs a read-only MCP server. It never signs or sends.

## MCP (installed by this plugin)

Streamable HTTP endpoint `https://papertrade-yield.pages.dev/mcp`. Manual install: `claude mcp add --transport http papertrade-yield https://papertrade-yield.pages.dev/mcp`.

| Tool | Inputs | Returns |
|---|---|---|
| `get_staking_stats` | none | Supply, staked amount and share, undistributed rewards, mint rate, realized USDC yield. |
| `get_apr` | optional `assumedPaperPriceUsd`, `window` (`24h`, `7d`, `30d`) | Realized USDC per 1M PAPER per day. A percentage APR only exists for a price you assume, since PAPER has no market price. |
| `get_yield_history` | optional `hours` | Hourly USDC distributed to stakers. |
| `get_claims_activity` | optional `hours` (1-72) | USDC claimed on chain per hour, unique claimers. |
| `get_wallet_staking` | `address` | Staked and unstaked PAPER, pending USDC, lifetime claimed, recent events. |
| `project_rewards` | `paperAmount` or `lossUsd`, optional `liquidated`, `days`, `window`, `assumedPaperPriceUsd` | What a position would earn if the realized pace continued. |
| `plan_staking_action` | `action` (`stake`, `unstake`, `claim`), `address`, optional `amountPaper` (string) | An UNSIGNED plan with preflight checks and the EIP-712 data the wallet would sign. |

## Rules

- A projection is not a promise. Always say the pace is realized history and can change.
- Staking, unstaking and claiming move funds. Only the user signs, in their own wallet. Show the plan (address, action, amount) and stop.

## Worked example

"What would 50,000 PAPER earn?" Call `project_rewards` with `{"paperAmount": 50000, "days": 30, "window": "7d"}`. Quote the USDC figure, the window it came from and the caveat that realized yield varies.
