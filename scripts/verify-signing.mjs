// Proves the PaperStaking EIP-712 wire format against the live relayer using a
// freshly generated throwaway key. The key holds nothing, so no intent can move
// funds. Expected: Stake, Unstake and Claim reach admission and are refused for
// lack of balance (409 admission_rejected), which proves the relayer recovered
// the signer; an intent signed as the wrong type is refused 403
// unauthorized_intent. Run: npm run verify:signing
import { PapertradeTrader } from 'papertrade-sdk';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const API = 'https://exchange.papertrade.xyz';
const account = privateKeyToAccount(generatePrivateKey());
const trader = new PapertradeTrader({ user: account.address, wallet: account });
console.log('throwaway wallet', account.address);

const pause = () => new Promise((r) => setTimeout(r, 1500));
const results = [];

async function viaSdk(name, run) {
  try {
    const receipt = await run();
    results.push({ name, outcome: 'accepted', detail: JSON.stringify(receipt) });
  } catch (e) {
    const err = /** @type {any} */ (e);
    results.push({ name, outcome: `${err.status ?? ''} ${err.code ?? ''}`.trim(), detail: JSON.stringify(err.payload ?? {}) });
  }
  await pause();
}

await viaSdk('stake 1000 PAPER', () => trader.stake('1000'));
await viaSdk('unstake 1 PAPER', () => trader.unstake('1'));
await viaSdk('claim', () => trader.claim());

const stakeIntent = await trader.prepareStake('1');
const mismatch = await fetch(`${API}/intents`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'paperClaim', signed: stakeIntent.signed }),
});
results.push({ name: 'Stake signature submitted as paperClaim', outcome: String(mismatch.status), detail: await mismatch.text() });

for (const r of results) console.log(`${r.name.padEnd(48)} ${r.outcome.padEnd(28)} ${r.detail}`);
const accepted = results.filter((r) => r.outcome === 'accepted');
if (accepted.length) {
  console.error('Unexpected: the relayer accepted an intent from a throwaway key.');
  process.exit(1);
}
