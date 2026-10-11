# Security

papertrade-yield is an unofficial, read-mostly dashboard. It never holds a private key, never signs, and never sends funds. The user's own wallet signs every Stake, Unstake, Claim and Distribute intent.

## Reporting a vulnerability

Open a private advisory: https://github.com/nirholas/papertrade-yield/security/advisories/new

Please do not file public issues for vulnerabilities. Expect an acknowledgement within a few days.

## Scope

- Pages Functions in `site/functions` (`/api/staking`, `/api/staking/claims`, `/api/staking/wallet`, `/api/papertrade/*`, `/openapi.json`).
- The browser app in `site/app.ts`.
- Anything that could make the app sign, or ask a wallet to sign, something other than what the confirmation dialog shows.

Out of scope: the Papertrade protocol and relayer themselves (report those to Papertrade), and loss of funds from trading at high leverage.

## Design notes

- The proxy forwards only public GET reads and the POST routes that carry already-signed intents.
- On-chain and API strings are escaped before rendering. Wallet names and icons from EIP-6963 are rendered with `textContent` and a `data:image` allowlist.
- Content-Security-Policy is `default-src 'self'` with `connect-src 'self'`; the one extra `style-src` hash covers the stylesheet lightweight-charts injects.
- `npm run verify:signing` uses a freshly generated throwaway key and the live relayer must refuse it.
