import { aggregateClaims, type ClaimsSummary } from './claims.js';
import { blockNumber, stakingChainState, stakingEvents, walletChainState, type RpcOptions } from './rpc.js';
import { buildSnapshot, type ChainState, type StakingSnapshot } from './snapshot.js';

/**
 * Shared data loaders used by the JSON API and by the MCP tools, so both read the
 * same sources and apply the same rules. Everything here is read-only.
 */

export const UPSTREAM = 'https://exchange.papertrade.xyz';
/** HyperEVM produces roughly one block per second. */
export const BLOCKS_PER_HOUR = 3600;
/** Page size of the Papertrade account history endpoints. */
const ACCOUNT_PAGE = 75;
/** Hard cap on account-history pages fetched for one wallet, so one call can never fan out. */
export const MAX_ACCOUNT_PAGES = 8;

export interface DataOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  rpc?: RpcOptions;
}

async function getJson<T>(options: DataOptions, path: string): Promise<T> {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? UPSTREAM).replace(/\/+$/, '');
  const res = await doFetch(`${base}${path}`, { headers: { accept: 'application/json', 'x-papertrade-build': 'papertrade-yield' } });
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Load the full staking snapshot: protocol summary, trading state, hourly history and the on-chain accumulator. */
export async function loadSnapshot(options: DataOptions = {}): Promise<StakingSnapshot> {
  const [summary, trading, history, chain] = await Promise.all([
    getJson<Parameters<typeof buildSnapshot>[0]['summary']>(options, '/query/protocol/summary'),
    getJson<Parameters<typeof buildSnapshot>[0]['trading']>(options, '/state/trading'),
    getJson<Parameters<typeof buildSnapshot>[0]['history']>(options, '/query/protocol/history?interval=1h'),
    stakingChainState(options.rpc).catch((): ChainState | null => null),
  ]);
  return buildSnapshot({ now: Date.now(), summary, trading, history, chain });
}

/** USDC claimed on chain by stakers over the trailing `hours` (1 to 72). */
export async function loadClaims(hours: number, options: DataOptions = {}): Promise<ClaimsSummary> {
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) throw new RangeError('hours must be an integer from 1 to 72.');
  const head = await blockNumber(options.rpc);
  const events = await stakingEvents({ kinds: ['Claimed'], fromBlock: head - hours * BLOCKS_PER_HOUR, toBlock: head, options: options.rpc });
  return aggregateClaims(events, { nowMs: Date.now(), hours });
}

export interface AccountStakingEvent {
  timestampMs: number;
  txHash: string;
  amountRaw: string;
  kind: 'staked' | 'unstaked' | 'claimed';
}

export interface WalletStaking {
  address: string;
  /** PaperStaking.pendingReward(address), USDC wad, read on chain now. */
  pendingRewardRaw: string;
  /** PAPER.balanceOf(address), wad, read on chain now (unstaked PAPER only). */
  paperBalanceRaw: string;
  /** Staked PAPER derived from the account's Staked and Unstaked history, wad. */
  stakedRaw: string;
  /** Lifetime USDC claimed, wad, summed from the account's Claimed history. */
  claimedRaw: string;
  /** False when the history was longer than the page cap, so stakedRaw and claimedRaw may be partial. */
  historyComplete: boolean;
  events: AccountStakingEvent[];
  readAt: string;
}

/** Sum a wallet's staking history into net staked PAPER and lifetime claimed USDC. Pure. */
export function summarizeAccountStaking(events: AccountStakingEvent[]): { stakedRaw: bigint; claimedRaw: bigint } {
  let staked = 0n;
  let claimed = 0n;
  for (const e of events) {
    const amount = BigInt(e.amountRaw);
    if (e.kind === 'staked') staked += amount;
    else if (e.kind === 'unstaked') staked -= amount;
    else claimed += amount;
  }
  return { stakedRaw: staked < 0n ? 0n : staked, claimedRaw: claimed };
}

/** Read one wallet: on-chain pending reward and PAPER balance, plus net staked from account history. */
export async function loadWalletStaking(address: string, options: DataOptions = {}): Promise<WalletStaking> {
  const addr = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) throw new RangeError('address must be a 0x-prefixed 20-byte hex address.');
  const events: AccountStakingEvent[] = [];
  const history = (async () => {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=${ACCOUNT_PAGE}` : `?limit=${ACCOUNT_PAGE}`;
      const body: { items: AccountStakingEvent[]; nextCursor: string | null } = await getJson(options, `/query/accounts/${addr}/staking${query}`);
      events.push(...body.items);
      cursor = body.nextCursor;
      if (!cursor) return true;
    }
    return false;
  })();
  const [chain, historyComplete] = await Promise.all([walletChainState(addr, options.rpc), history]);
  const { stakedRaw, claimedRaw } = summarizeAccountStaking(events);
  return {
    address: addr,
    pendingRewardRaw: chain.pendingRewardRaw.toString(),
    paperBalanceRaw: chain.paperBalanceRaw.toString(),
    stakedRaw: stakedRaw.toString(),
    claimedRaw: claimedRaw.toString(),
    historyComplete,
    events,
    readAt: new Date().toISOString(),
  };
}
