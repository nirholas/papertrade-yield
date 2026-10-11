import { MAINNET, decodeTradingState, paperMintRate, wadToNumber, type ProtocolHistory, type ProtocolSummary } from 'papertrade-sdk';
import { buildRewardSeries, reconstructionError, yieldWindows, type RewardPoint, type YieldWindow } from './apr.js';
import { sampleMintCurve, type CurvePoint } from './curve.js';

type RawTradingState = Parameters<typeof decodeTradingState>[0];

export interface ChainState {
  accRewardPerShareRaw: bigint;
  totalStakedRaw: bigint;
  paperSupplyRaw: bigint;
}

export interface StakingSnapshot {
  generatedAt: string;
  source: { apiBlock: number; historyAsOfMs: number; chainRead: boolean };
  protocol: {
    paperSupply: number;
    paperStaked: number;
    stakedShare: number;
    /** accRewardPerShare as the 1e27-scaled integer string. */
    accRewardPerShareRaw: string;
    /** accRewardPerShare as USDC per PAPER (accRewardPerShareRaw / 1e27). */
    accRewardPerShareUsdPerPaper: number;
    /** Undistributed staker rewards accrued in the protocol, USD (what a Distribute intent pushes into the accumulator). */
    pendingRewardsUsd: number;
    minimumStakePaper: number;
    onchain: null | {
      accRewardPerShareRaw: string;
      totalStakedRaw: string;
      paperSupplyRaw: string;
      accMatchesApi: boolean;
    };
  };
  mint: {
    rate: number;
    flatRate: number;
    flatThresholdUsd: number;
    decayScaleUsd: number;
    trackedLpUsd: number;
    tailProgressUsd: number;
    onFlatBranch: boolean;
    curve: CurvePoint[];
  };
  lp: {
    tvlUsd: number;
    trackedLpUsd: number;
    cliffUsd: number;
    stakerRewardCapUsd: number;
    excessUsd: number;
    queueUsd: number;
    lifetimeFeesUsd: number;
  };
  yield: {
    method: string;
    pricing: string;
    windows: YieldWindow[];
    series: Array<Pick<RewardPoint, 't' | 'rewardUsd' | 'avgStakedPaper' | 'rewardPerPaper' | 'spanHours'> & { usdPer1MPaperPerDay: number }>;
    cumulativeRewardsUsd: number;
    /** Relative gap between summed reconstructed reward per PAPER and the on-chain accumulator. */
    reconstructionError: number;
  };
}

export const YIELD_METHOD =
  'Realized, not forecast. USDC distributed to stakers per hourly bucket (Papertrade protocol history, staking rewards) divided by the mean staked PAPER over that bucket, summed over the window, scaled to one day. The open hour counts only the time elapsed; the oldest bucket in a window is pro-rated. Windows longer than the protocol has existed use all available history and are marked incomplete.';

export const PRICING_NOTE =
  'PAPER has no DEX pool and no spot listing, so it has no market price. A percentage APR needs a price, so yield is quoted as USDC per 1M PAPER per day. Enter an assumed price in the app to see an implied APR.';

/** Pure assembly of the dashboard payload from raw API responses and an optional chain read. */
export function buildSnapshot(input: {
  now: number;
  summary: ProtocolSummary;
  trading: RawTradingState;
  history: ProtocolHistory;
  chain: ChainState | null;
}): StakingSnapshot {
  const { summary, history, chain } = input;
  const trading = decodeTradingState(input.trading);
  const paper = summary.paper;
  const trackedLpUsd = wadToNumber(paper.trackedLp);
  const tailProgressUsd = wadToNumber(paper.tailProgress);
  const rate = paperMintRate({ trackedLpUsd, tailProgressUsd });
  const supply = wadToNumber(paper.supply);
  const staked = wadToNumber(paper.staked);
  const acc = trading.accRewardPerShareRaw;

  const points = buildRewardSeries({
    startMs: history.startMs,
    intervalMs: history.intervalMs,
    asOfMs: history.source.asOfMs,
    columns: history.columns,
  });

  return {
    generatedAt: new Date(input.now).toISOString(),
    source: { apiBlock: trading.indexedThroughBlock, historyAsOfMs: history.source.asOfMs, chainRead: chain !== null },
    protocol: {
      paperSupply: supply,
      paperStaked: staked,
      stakedShare: supply > 0 ? staked / supply : 0,
      accRewardPerShareRaw: acc.toString(),
      accRewardPerShareUsdPerPaper: Number(acc) / 1e27,
      pendingRewardsUsd: wadToNumber(paper.pendingRewards),
      minimumStakePaper: Number(trading.intake.minimumPaperStakeRaw) / 1e18,
      onchain: chain && {
        accRewardPerShareRaw: chain.accRewardPerShareRaw.toString(),
        totalStakedRaw: chain.totalStakedRaw.toString(),
        paperSupplyRaw: chain.paperSupplyRaw.toString(),
        accMatchesApi: chain.accRewardPerShareRaw === acc,
      },
    },
    mint: {
      rate,
      flatRate: 100,
      flatThresholdUsd: 2_000_000,
      decayScaleUsd: 120_000_000,
      trackedLpUsd,
      tailProgressUsd,
      onFlatBranch: trackedLpUsd < 2_000_000,
      curve: sampleMintCurve(Math.max(600_000_000, tailProgressUsd * 2)),
    },
    lp: {
      tvlUsd: wadToNumber(summary.balances.tvl),
      trackedLpUsd,
      cliffUsd: wadToNumber(paper.cliff),
      stakerRewardCapUsd: wadToNumber(paper.cap),
      excessUsd: wadToNumber(paper.excess),
      queueUsd: wadToNumber(summary.balances.queue),
      lifetimeFeesUsd: wadToNumber(summary.fees.lifetime),
    },
    yield: {
      method: YIELD_METHOD,
      pricing: PRICING_NOTE,
      windows: yieldWindows(points),
      series: points.map((p) => ({
        t: p.t,
        spanHours: p.spanHours,
        rewardUsd: p.rewardUsd,
        avgStakedPaper: p.avgStakedPaper,
        rewardPerPaper: p.rewardPerPaper,
        usdPer1MPaperPerDay: (p.rewardPerPaper / p.spanHours) * 24 * 1_000_000,
      })),
      cumulativeRewardsUsd: wadToNumber(history.totals.rewardsRaw),
      reconstructionError: reconstructionError(points, acc),
    },
  };
}

export const CONTRACTS = { paper: MAINNET.contracts.paper, paperStaking: MAINNET.contracts.paperStaking };
