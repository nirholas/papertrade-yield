/**
 * GET /api/staking/wallet?address=0x...: the on-chain PaperStaking pendingReward (USDC wad) and
 * PAPER balance for one wallet. The browser cannot call the HyperEVM RPC itself (CSP connect-src
 * is same-origin), so this reads it. Cached for 15 seconds per address.
 */
import { walletChainState } from '../../../../src/rpc';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'x-content-type-options': 'nosniff',
};

const fail = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ code, message }), { status, headers: { ...JSON_HEADERS, 'cache-control': 'no-store' } });

export const onRequestGet: PagesFunction = async ({ request, waitUntil }) => {
  const address = new URL(request.url).searchParams.get('address')?.toLowerCase() ?? '';
  if (!/^0x[0-9a-f]{40}$/.test(address)) return fail(400, 'invalid_address', 'address must be a 0x-prefixed 20-byte hex address.');
  const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
  const cacheKey = new Request(new URL(`/api/staking/wallet?address=${address}`, request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const { pendingRewardRaw, paperBalanceRaw } = await walletChainState(address);
    const response = new Response(
      JSON.stringify({ address, pendingRewardRaw: pendingRewardRaw.toString(), paperBalanceRaw: paperBalanceRaw.toString(), readAt: new Date().toISOString() }),
      { headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=15' } },
    );
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return fail(502, 'rpc_unavailable', `HyperEVM read failed: ${err instanceof Error ? err.message : String(err)}`);
  }
};
