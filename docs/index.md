---
title: Overview
description: What Papertrade Yield is, what it reads, and the three ways to use it: the web app, the JSON API and the MCP server.
order: 1
---

# Papertrade Yield

Papertrade Yield is an unofficial dashboard, JSON API and MCP server for **PAPER staking** on [Papertrade](https://papertrade.xyz), the on-chain synthetic perpetuals exchange on HyperEVM. It is not affiliated with Papertrade. High leverage can lose your whole margin, and nothing here is financial advice.

PAPER is minted to traders who lose, and it is staked in the `PaperStaking` contract to earn USDC. This project answers the practical questions about that loop with real data:

- How much USDC was actually paid to stakers in the last 24 hours, 7 days and 30 days?
- What does that mean per million PAPER per day, given that PAPER has no market price?
- Where is the mint curve right now, and how much PAPER does a given loss mint?
- What is in a specific wallet: PAPER held, PAPER staked, pending rewards, lifetime claims?
- What would staking, unstaking or claiming look like, step by step, before anything is signed?

## Three surfaces

| Surface | Where | For |
| --- | --- | --- |
| Web app | [papertrade-yield.pages.dev](https://papertrade-yield.pages.dev) | People. Live data, a calculator and wallet-signed Stake, Unstake and Claim. |
| JSON API | `/api/staking`, `/api/staking/claims`, `/api/staking/wallet` | Scripts and services. See the [reference](/docs/reference/). |
| MCP server | `https://papertrade-yield.pages.dev/mcp` | AI agents. Seven read-only tools. See [MCP](/docs/mcp/). |

## What it reads

Everything is read-only and comes from public sources:

- The Papertrade API at `https://exchange.papertrade.xyz` (protocol summary, trading state, hourly protocol history, per-account staking history).
- The HyperEVM chain (chain id 999) through public RPC providers, for the `PaperStaking` accumulator, `pendingReward(address)`, `PAPER.balanceOf(address)` and `Claimed` logs.

## What it never does

Nothing in the server, the API or the MCP tools signs, sends, swaps, bridges, mints or pays. The MCP tool `plan_staking_action` returns an **unsigned plan** only. When a person stakes through the web app, their own browser wallet signs the EIP-712 intent and the Papertrade relayer submits it. See [Security and limits](/docs/security/).

## Where to go next

1. [Quickstart](/docs/quickstart/): read your first yield number in one command.
2. [Connect your AI](/docs/connect-your-ai/): copy-paste setup for Claude, Codex, ChatGPT, Gemini, Cursor and more.
3. [Concepts](/docs/concepts/): the Papertrade rules that make the numbers mean what they say.
