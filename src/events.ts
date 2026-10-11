import { parseAbi, type Address, type Hex } from 'viem';

/**
 * PaperStaking events, verified against mainnet logs (topic0 hashes below come
 * from live logs of 0xaad6c7b0cc3014fc80ffedae0ed7ce5967b0f016, and each hash
 * is reproduced by viem from the signature in test/events.test.ts).
 *
 * The contract emits no event when accRewardPerShare grows, so reward history
 * comes from the protocol history API, not from logs. Claimed is the USDC paid
 * out to stakers (18-decimal wad).
 */
export const PAPER_STAKING_EVENTS_ABI = parseAbi([
  'event Staked(address indexed user, uint256 amount)',
  'event Unstaked(address indexed user, uint256 amount)',
  'event Claimed(address indexed user, uint256 amount)',
  'event NonceUsed(address indexed user, uint256 indexed nonce, uint256 next)',
]);

export const TOPICS = {
  Staked: '0x9e71bc8eea02a63969f509818f2dafb9254532904319f9dbda79b67bd34a5f3d',
  Unstaked: '0x0f5bb82176feb1b5e747e28471aa92156a04d9f3ab9f45f28e2d704232b93f75',
  Claimed: '0xd8138f8a3f377c5259ca548e70e4c2de94f129f5a11036a15b69513cba2b426a',
  NonceUsed: '0x3fde1edb52bbe023081a01c60e06e15396e067be4699a5044fdfa793f67bfc28',
} as const;

export type StakingEventName = 'Staked' | 'Unstaked' | 'Claimed';

export interface RawLog {
  topics: readonly Hex[];
  data: Hex;
  blockNumber: Hex;
  blockTimestamp?: Hex;
  transactionHash: Hex;
  logIndex: Hex;
}

export interface StakingEvent {
  kind: StakingEventName;
  user: Address;
  /** PAPER wad for Staked and Unstaked, USDC wad for Claimed. */
  amountRaw: bigint;
  blockNumber: number;
  /** Unix seconds from the RPC's blockTimestamp field, when provided. */
  timestamp: number | null;
  txHash: Hex;
  logIndex: number;
}

const BY_TOPIC: Record<string, StakingEventName> = {
  [TOPICS.Staked]: 'Staked',
  [TOPICS.Unstaked]: 'Unstaked',
  [TOPICS.Claimed]: 'Claimed',
};

/**
 * Decode a Staked, Unstaked or Claimed log without viem's ABI machinery, so a
 * Worker can decode thousands of logs inside a small CPU budget. Returns null
 * for any other event or a malformed log.
 */
export function decodeStakingLog(log: RawLog): StakingEvent | null {
  const kind = BY_TOPIC[log.topics[0]];
  if (!kind || log.topics.length !== 2 || log.data.length !== 66) return null;
  return {
    kind,
    user: `0x${log.topics[1].slice(26)}`.toLowerCase() as Address,
    amountRaw: BigInt(log.data),
    blockNumber: Number(BigInt(log.blockNumber)),
    timestamp: log.blockTimestamp ? Number(BigInt(log.blockTimestamp)) : null,
    txHash: log.transactionHash,
    logIndex: Number(BigInt(log.logIndex)),
  };
}
