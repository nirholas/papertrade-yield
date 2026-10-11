/**
 * GET /api/staking: the PAPER staking dashboard payload as JSON.
 * Combines the public Papertrade API (protocol summary, trading state, hourly
 * history) with an on-chain read of PaperStaking. Cached at the edge for 60 s.
 */
import { buildSnapshot, type ChainState } from '../../../src/snapshot';
import { stakingChainState } from '../../../src/rpc';

interface Env {
  PAPERTRADE_API_URL?: string;
}

const UPSTREAM = 'https://exchange.papertrade.xyz';
const CACHE_SECONDS = 60;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'x-content-type-options': 'nosniff',
};

function fail(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ code, message }), { status, headers: { ...JSON_HEADERS, 'cache-control': 'no-store' } });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
  const cacheKey = new Request(new URL('/api/staking', request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const base = (env.PAPERTRADE_API_URL ?? UPSTREAM).replace(/\/+$/, '');
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, { headers: { accept: 'application/json', 'x-papertrade-build': 'papertrade-yield' } });
    if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  try {
    const [summary, trading, history, chain] = await Promise.all([
      get<Parameters<typeof buildSnapshot>[0]['summary']>('/query/protocol/summary'),
      get<Parameters<typeof buildSnapshot>[0]['trading']>('/state/trading'),
      get<Parameters<typeof buildSnapshot>[0]['history']>('/query/protocol/history?interval=1h'),
      stakingChainState().catch((): ChainState | null => null),
    ]);
    const body = JSON.stringify(buildSnapshot({ now: Date.now(), summary, trading, history, chain }));
    const response = new Response(body, { headers: { ...JSON_HEADERS, 'cache-control': `public, max-age=${CACHE_SECONDS}` } });
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return fail(502, 'upstream_unavailable', `Could not read Papertrade: ${err instanceof Error ? err.message : String(err)}`);
  }
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' } });
