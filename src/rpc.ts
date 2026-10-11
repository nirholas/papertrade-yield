import { MAINNET } from 'papertrade-sdk';
import { TOPICS, decodeStakingLog, type RawLog, type StakingEvent, type StakingEventName } from './events.js';

/**
 * HyperEVM JSON-RPC with provider fallback. The default public RPC caps getLogs
 * at 1,000 blocks and rate limits hard, so the providers that accept
 * topic-filtered ranges of tens of thousands of blocks come first.
 */
export const RPC_PROVIDERS = [
  'https://hyperliquid-json-rpc.stakely.io',
  'https://rpc.hyperlend.finance',
  MAINNET.network.rpcUrl,
  'https://rpc.hypurrscan.io',
] as const;

export class RpcError extends Error {
  constructor(message: string, readonly code: number | null) {
    super(message);
    this.name = 'RpcError';
  }
}

export interface RpcOptions {
  providers?: readonly string[];
  fetch?: typeof fetch;
}

async function call<T>(providers: readonly string[], doFetch: typeof fetch, method: string, params: unknown[]): Promise<T> {
  let last: Error = new RpcError('no RPC providers configured', null);
  for (const url of providers) {
    try {
      const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (!res.ok) throw new RpcError(`${url} HTTP ${res.status}`, null);
      const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
      if (body.error) throw new RpcError(`${url}: ${body.error.message}`, body.error.code);
      return body.result as T;
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw last;
}

export async function blockNumber(options: RpcOptions = {}): Promise<number> {
  const hex = await call<string>(options.providers ?? RPC_PROVIDERS, options.fetch ?? fetch, 'eth_blockNumber', []);
  return Number(BigInt(hex));
}

/** Fetch PaperStaking events of the given kinds in [fromBlock, toBlock], chunked so each request stays small. */
export async function stakingEvents(params: {
  kinds: StakingEventName[];
  fromBlock: number;
  toBlock: number;
  chunk?: number;
  options?: RpcOptions;
}): Promise<StakingEvent[]> {
  const providers = params.options?.providers ?? RPC_PROVIDERS;
  const doFetch = params.options?.fetch ?? fetch;
  const chunk = params.chunk ?? 25_000;
  const topics = [params.kinds.map((k) => TOPICS[k])];
  const ranges: Array<[number, number]> = [];
  for (let from = params.fromBlock; from <= params.toBlock; from += chunk) ranges.push([from, Math.min(from + chunk - 1, params.toBlock)]);
  const batches = await Promise.all(
    ranges.map(([from, to]) =>
      call<RawLog[]>(providers, doFetch, 'eth_getLogs', [
        { address: MAINNET.contracts.paperStaking, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics },
      ]),
    ),
  );
  const events: StakingEvent[] = [];
  for (const logs of batches) for (const log of logs) {
    const event = decodeStakingLog(log);
    if (event) events.push(event);
  }
  return events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

/** Read accRewardPerShare, totalStaked and PAPER totalSupply from chain with plain eth_call (no viem client needed). */
export async function stakingChainState(options: RpcOptions = {}): Promise<{ accRewardPerShareRaw: bigint; totalStakedRaw: bigint; paperSupplyRaw: bigint }> {
  const providers = options.providers ?? RPC_PROVIDERS;
  const doFetch = options.fetch ?? fetch;
  const read = async (to: string, selector: string) => BigInt(await call<string>(providers, doFetch, 'eth_call', [{ to, data: selector }, 'latest']));
  const [acc, total, supply] = await Promise.all([
    read(MAINNET.contracts.paperStaking, SELECTORS.accRewardPerShare),
    read(MAINNET.contracts.paperStaking, SELECTORS.totalStaked),
    read(MAINNET.contracts.paper, SELECTORS.totalSupply),
  ]);
  return { accRewardPerShareRaw: acc, totalStakedRaw: total, paperSupplyRaw: supply };
}

/** On-chain PaperStaking pendingReward (USDC wad) and PAPER balanceOf for one wallet, via plain eth_call. */
export async function walletChainState(address: string, options: RpcOptions = {}): Promise<{ pendingRewardRaw: bigint; paperBalanceRaw: bigint }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new RpcError('address must be a 0x-prefixed 20-byte hex string', null);
  const providers = options.providers ?? RPC_PROVIDERS;
  const doFetch = options.fetch ?? fetch;
  const arg = address.slice(2).toLowerCase().padStart(64, '0');
  const read = async (to: string, selector: string) => BigInt(await call<string>(providers, doFetch, 'eth_call', [{ to, data: `${selector}${arg}` }, 'latest']));
  const [pendingRewardRaw, paperBalanceRaw] = await Promise.all([
    read(MAINNET.contracts.paperStaking, SELECTORS.pendingReward),
    read(MAINNET.contracts.paper, SELECTORS.balanceOf),
  ]);
  return { pendingRewardRaw, paperBalanceRaw };
}

/** 4-byte selectors, asserted against viem in test/events.test.ts. */
export const SELECTORS = {
  pendingReward: '0xf40f0f52',
  balanceOf: '0x70a08231',
  accRewardPerShare: '0x939d6237',
  totalStaked: '0x817b1cd2',
  totalSupply: '0x18160ddd',
} as const;
