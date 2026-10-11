---
title: Concepts
description: The Papertrade and PaperStaking rules that decide what the numbers mean: PAPER minting, realized yield, APR and units.
order: 3
---

# Concepts

## PAPER and PaperStaking

Papertrade mints **PAPER** to traders on the losing side of a position, at a rate set by the **mint curve**. Holders stake PAPER in the `PaperStaking` contract and earn **USDC** that the protocol distributes. The relayer runs reward distribution. Users sign three actions: Stake, Unstake and Claim.

| Item | Value |
| --- | --- |
| Chain | HyperEVM, chain id 999 |
| PAPER | `0xe40f17915daa230324030003a197cdaef2261c0e` |
| PaperStaking | `0xaad6c7b0cc3014fc80ffedae0ed7ce5967b0f016` |
| Minimum stake | Read it live from `get_staking_stats` or `/api/staking` (`protocol.minimumStakePaper`). |

## Realized yield, not a forecast

Every yield number here is **history**. For each hour, Papertrade reports the revenue that went to PAPER stakers (`paperRevenue`) and the staked PAPER. The yield for a window is the revenue divided by the mean staked PAPER (trapezoid rule over hourly samples), pro-rated to the window. It says what stakers earned, not what they will earn.

## Why per million PAPER per day

PAPER has no market price, so a percentage return cannot be computed honestly. The headline unit is **USDC per 1,000,000 staked PAPER per day** (`usdPer1MPaperPerDay`). It is a plain USDC amount that needs no price assumption.

## APR needs an assumed price

If you want a percentage, you supply the price: `get_apr` accepts `assumedPaperPriceUsd`. APR is then `usdPerPaperPerDay * 365 / assumedPrice`, **simple and not compounded**. The assumption is yours and the result is labeled as implied.

## Units

- Raw on-chain amounts are 18-decimal integers ("wads"), returned as strings. Keep them as `BigInt` until display.
- `accRewardPerShare` is scaled by 1e27.
- Block time on HyperEVM is about one second, so 3,600 blocks is about one hour. The claims tool uses this to bound its log window.

## Staked balance is derived

`PaperStaking` exposes `pendingReward(address)`, and the PAPER token exposes `balanceOf`, but there is no per-user stake getter in the contract ABI used here. The staked amount is the net of the wallet's `Staked` and `Unstaked` events from the Papertrade account history (up to eight pages of 75). `historyComplete: false` means the cap was hit and the figure may be partial.

## Reward history comes from the API, not logs

`PaperStaking` emits no event when the reward accumulator grows, and public RPCs are not archive nodes. Reward history therefore comes from the Papertrade protocol history, cross-checked on chain against `accRewardPerShare` (the `reconstructionError` field). `Claimed` logs are real events and power the claims tool.

## Intents and signing

Stake, Unstake and Claim are EIP-712 typed-data intents in the `PaperStaking` domain with the fields `user`, `amount`, `nonce` and `deadline`. The user's wallet signs and the Papertrade relayer submits. This project never holds keys. The MCP tool `plan_staking_action` shows the exact typed data to be signed, with nonce and deadline allocated at signing time.
