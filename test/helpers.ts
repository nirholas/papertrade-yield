import summary from './fixtures/summary.json';
import trading from './fixtures/trading.json';
import history from './fixtures/history-1h.json';
import chain from './fixtures/chain.json';
import accountStaking from './fixtures/account-staking.json';
import { SELECTORS } from '../src/rpc';
import type { DataOptions } from '../src/data';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that replays recorded real Papertrade API responses and HyperEVM eth_call results. */
export function recordedFetch(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.endsWith('/query/protocol/summary')) return json(summary);
    if (url.endsWith('/state/trading')) return json(trading);
    if (url.includes('/query/protocol/history')) return json(history);
    if (/\/query\/accounts\/0x[0-9a-f]{40}\/staking/.test(url)) return json(accountStaking);
    if (url.startsWith('https://exchange.papertrade.xyz')) return json({ error: 'not recorded' }, 404);
    const body = JSON.parse(String(init?.body)) as { method: string; params: Array<{ data?: string }> };
    if (body.method === 'eth_call') {
      const data = body.params[0].data ?? '';
      const results: Record<string, string> = {
        [SELECTORS.accRewardPerShare]: BigInt(chain.accRewardPerShare).toString(16),
        [SELECTORS.totalStaked]: '0',
        [SELECTORS.totalSupply]: '0',
        [SELECTORS.pendingReward]: (5n * 10n ** 17n).toString(16),
        [SELECTORS.balanceOf]: (1000n * 10n ** 18n).toString(16),
      };
      const hex = results[data.slice(0, 10)];
      return json({ jsonrpc: '2.0', id: 1, result: `0x${hex}` });
    }
    return json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'unrecorded method' } });
  }) as typeof fetch;
}

export function recordedData(calls: string[] = []): DataOptions {
  const f = recordedFetch(calls);
  return { fetch: f, rpc: { fetch: f, providers: ['https://rpc.test'] } };
}
