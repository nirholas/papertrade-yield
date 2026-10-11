# Changelog

## 0.1.0 - 2026-10-10

- Protocol view: PAPER supply, staked and staked share, accRewardPerShare (API and on-chain cross-check), mint rate from the SDK `paperMintRate`, the mint curve with today marked, LP and queue context, minimum stake.
- Reward history and realized yield: USDC paid to stakers per hour from the Papertrade protocol history, windows for 24h, 7d and 30d with the method stated, and yield quoted as USDC per 1M PAPER per day because PAPER has no price. Optional implied APR at a user-assumed price.
- On-chain claims panel from PaperStaking `Claimed` logs.
- Wallet view over EIP-6963 or a pasted read-only address: PAPER held, staked, pending rewards from the live stream and from `pendingReward`, lifetime claimed, estimated daily earnings.
- Wallet-signed Stake, Unstake and Claim through `PapertradeTrader`, each with a confirmation dialog and live intent status.
- Loss to PAPER calculator.
- Pages Functions `/api/staking`, `/api/staking/claims`, `/api/staking/wallet`, `/openapi.json`.
- Tests with recorded real fixtures for the APR math, event decoding, claims, curve and pending-reward math.
