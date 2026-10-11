/**
 * GET /api/staking/claims?hours=24: USDC claimed by stakers on chain, bucketed per hour.
 * Reads PaperStaking `Claimed` logs. Cached at the edge for 5 minutes.
 */
import { blockNumber, stakingEvents } from '../../../../src/rpc';
import { aggregateClaims } from '../../../../src/claims';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'x-content-type-options': 'nosniff',
};

/** HyperEVM produces roughly one block per second. */
const BLOCKS_PER_HOUR = 3600;

export const onRequestGet: PagesFunction = async ({ request, waitUntil }) => {
  const url = new URL(request.url);
  const hoursParam = url.searchParams.get('hours');
  const hours = hoursParam === null ? 24 : Number(hoursParam);
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) {
    return new Response(JSON.stringify({ code: 'invalid_hours', message: 'hours must be an integer from 1 to 72.' }), {
      status: 400,
      headers: { ...JSON_HEADERS, 'cache-control': 'no-store' },
    });
  }
  const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
  const cacheKey = new Request(new URL(`/api/staking/claims?hours=${hours}`, request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const head = await blockNumber();
    const events = await stakingEvents({ kinds: ['Claimed'], fromBlock: head - hours * BLOCKS_PER_HOUR, toBlock: head });
    const body = JSON.stringify(aggregateClaims(events, { nowMs: Date.now(), hours }));
    const response = new Response(body, { headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=300' } });
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ code: 'rpc_unavailable', message: `HyperEVM logs unavailable: ${err instanceof Error ? err.message : String(err)}` }), {
      status: 502,
      headers: { ...JSON_HEADERS, 'cache-control': 'no-store' },
    });
  }
};
