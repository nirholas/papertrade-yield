import { createChart, ColorType, HistogramSeries, LineSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { createWalletClient, custom, getAddress, isAddress, type Address, type EIP1193Provider, type Hex } from 'viem';
import {
  INTENT_TTL_SECONDS,
  MAINNET,
  PapertradeApiError,
  PapertradeClient,
  PapertradeTrader,
  formatUnits,
  parseUnits,
  paperStakingDomain,
  pendingStakingRewardRaw,
  streamWallet,
  type IntentOutcome,
  type PendingOperation,
  type SubmittedIntent,
  type WalletState,
  type WalletStreamStatus,
} from 'papertrade-sdk';
import { aprPercent, dailyEarnings } from '../src/apr.js';
import { projectLoss } from '../src/curve.js';
import type { ClaimsSummary } from '../src/claims.js';
import type { StakingSnapshot } from '../src/snapshot.js';

type Action = 'stake' | 'unstake' | 'claim';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const client = new PapertradeClient({ baseUrl: '/api/papertrade', clientBuild: 'papertrade-yield' });

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const usd = (n: number, digits = 2) => `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const compact = (n: number) => n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 });
const paperFmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 4 });
const wad = (raw: bigint) => Number(formatUnits(raw, 18));
const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const shareOf = (f: number) => (f === 0 ? '0%' : f < 0.0001 ? `${(f * 100).toPrecision(2)}%` : pct(f, 2));
const pct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`;

const stat = (k: string, v: string, note = '', cls = '') =>
  `<div class="stat ${cls}"><p class="k">${esc(k)}</p><p class="v">${esc(v)}</p>${note ? `<p class="n">${esc(note)}</p>` : ''}</div>`;
const fact = (k: string, v: string, cls = '') => `<div><dt>${esc(k)}</dt><dd class="${cls}">${esc(v)}</dd></div>`;

// Protocol data

let snapshot: StakingSnapshot | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: the server did not return JSON`);
  }
  if (!res.ok) {
    const msg = (body as { message?: string }).message;
    throw new Error(msg ?? `HTTP ${res.status}`);
  }
  return body as T;
}

function setStatus(text: string, kind: 'ok' | 'wait' | 'bad') {
  const el = $('data-status');
  el.textContent = text;
  el.className = `chip chip-${kind}`;
}

function errorBox(title: string, detail: string, retryId: string) {
  return `<div class="errorbox" role="alert"><h3>${esc(title)}</h3><p>${esc(detail)}</p><button id="${retryId}" class="btn" type="button">Retry</button></div>`;
}

async function loadSnapshot() {
  setStatus('Loading live data', 'wait');
  try {
    snapshot = await getJson<StakingSnapshot>('/api/staking');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    setStatus('Data unavailable', 'bad');
    $('hero-stat').innerHTML = errorBox('Could not load staking data', detail, 'retry-hero');
    $('protocol-grid').innerHTML = '';
    $('retry-hero').addEventListener('click', () => void loadAll());
    return;
  }
  renderHero(snapshot);
  renderProtocol(snapshot);
  renderMint(snapshot);
  renderRewards(snapshot);
  renderApr();
  renderCalculator();
  renderWallet();
  const t = new Date(snapshot.generatedAt).toLocaleTimeString();
  const chain = snapshot.protocol.onchain;
  const check = chain ? (chain.accMatchesApi ? 'on-chain check matches' : 'on-chain value differs from API') : 'on-chain read unavailable';
  setStatus(`Live ${t}, API block ${snapshot.source.apiBlock.toLocaleString()}, ${check}`, chain && !chain.accMatchesApi ? 'wait' : 'ok');
}

function window24(s: StakingSnapshot) {
  return s.yield.windows[0];
}

function renderHero(s: StakingSnapshot) {
  const w = window24(s);
  const incomplete = !w.complete;
  $('hero-stat').innerHTML = `
    <div class="big">${esc(usd(w.usdPer1MPaperPerDay))}<small>USDC per 1M PAPER per day</small></div>
    <p class="aside">Realized over ${esc(w.hoursCovered.toFixed(1))} of the last ${esc(w.hours)} hours${incomplete ? ' (all history so far)' : ''}. Average ${esc(compact(w.avgStakedPaper))} PAPER staked. ${esc(s.yield.pricing.split('. ')[0])}.</p>`;
}

function renderProtocol(s: StakingSnapshot) {
  const p = s.protocol;
  $('protocol-grid').innerHTML = [
    stat('PAPER supply', compact(p.paperSupply), `${paperFmt(p.paperSupply)} PAPER minted so far`),
    stat('Staked', compact(p.paperStaked), `${pct(p.stakedShare, 1)} of supply`, 'good'),
    stat('Mint rate now', `${s.mint.rate.toFixed(2)} PAPER per $1`, s.mint.onFlatBranch ? 'Flat branch: tracked LP is under $2M' : 'Decay branch: slows as LP grows'),
    stat('accRewardPerShare', `$${p.accRewardPerShareUsdPerPaper.toFixed(6)}`, `USDC earned per staked PAPER, lifetime. Raw ${p.accRewardPerShareRaw} (1e27)`),
    stat('Undistributed rewards', usd(p.pendingRewardsUsd), 'Accrued for stakers, pushed into the pool when the relayer runs a Distribute'),
    stat('Minimum stake', `${paperFmt(p.minimumStakePaper)} PAPER`, 'Smaller stakes are refused at intake'),
  ].join('');
}

function renderMint(s: StakingSnapshot) {
  const m = s.mint;
  const W = 520;
  const H = 260;
  const pad = { l: 44, r: 12, t: 14, b: 32 };
  const maxX = m.curve[m.curve.length - 1].tailProgressUsd;
  const x = (v: number) => pad.l + (v / maxX) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / 100) * (H - pad.t - pad.b);
  const path = m.curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.tailProgressUsd).toFixed(1)},${y(p.rate).toFixed(1)}`).join('');
  const area = `${path}L${x(maxX).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
  const mx = x(Math.min(m.tailProgressUsd, maxX));
  const my = y(m.rate);
  const yTicks = [0, 25, 50, 75, 100].map((v) => `<line class="gridline" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<text x="${x(maxX * f)}" y="${H - 10}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">$${Math.round((maxX * f) / 1e6)}M</text>`).join('');
  const labelRight = mx > W * 0.6;
  $('mint-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="presentation" focusable="false">
    ${yTicks}${xTicks}<path class="area" d="${area}"/><path class="curve" d="${path}"/>
    <line class="marker-line" x1="${mx}" x2="${mx}" y1="${my}" y2="${y(0)}"/>
    <circle class="marker" cx="${mx}" cy="${my}" r="6"/>
    <text class="marker-label" x="${labelRight ? mx - 10 : mx + 10}" y="${Math.max(pad.t + 10, my - 10)}" text-anchor="${labelRight ? 'end' : 'start'}">Today ${m.rate.toFixed(1)}</text>
  </svg>`;
  $('mint-chart').setAttribute('aria-label', `Mint rate falls from 100 PAPER per dollar. Today it is ${m.rate.toFixed(2)} at ${usd(m.tailProgressUsd, 0)} of tail progress.`);
  $('mint-lede').textContent = 'PAPER minted per $1 of loss basis, against tail progress (x axis). The marker is today.';
  $('mint-facts').innerHTML = [
    fact('Rate now', `${m.rate.toFixed(4)} PAPER per $1`),
    fact('Tail progress', usd(m.tailProgressUsd, 0)),
    fact('Tracked LP', usd(m.trackedLpUsd, 0)),
    fact('Formula', m.onFlatBranch ? '100 while tracked LP < $2M' : '100 x (S / (S + H))^2, S = $120M'),
  ].join('') + (m.onFlatBranch ? '' : `<div><dt>Curve shown</dt><dd>Branch that applies at tracked LP of $2M or more</dd></div>`);
  const l = s.lp;
  $('lp-facts').innerHTML = [
    fact('Pool value (TVL)', usd(l.tvlUsd, 0)),
    fact('Tracked LP', usd(l.trackedLpUsd, 0)),
    fact('Cliff', usd(l.cliffUsd, 0)),
    fact('Staker reward cap', usd(l.stakerRewardCapUsd, 0)),
    fact('Excess over cap', usd(l.excessUsd, 0)),
    fact('Withdrawal queue', usd(l.queueUsd, 0), l.queueUsd > 0 ? 'warn' : ''),
    fact('Lifetime protocol fees', usd(l.lifetimeFeesUsd, 0)),
  ].join('');
}

// Reward history

let chart: IChartApi | null = null;

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderRewards(s: StakingSnapshot) {
  const el = $('rewards-chart');
  if (chart) {
    chart.remove();
    chart = null;
  }
  const series = s.yield.series;
  if (series.length === 0) {
    el.innerHTML = '<div class="empty"><p>No staking rewards have been distributed yet. This chart fills in once USDC reaches stakers.</p></div>';
    $('rewards-caption').textContent = '';
  } else {
    el.innerHTML = '';
    chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssVar('--ink-2'), fontFamily: cssVar('--mono') },
      grid: { vertLines: { color: cssVar('--rule') }, horzLines: { color: cssVar('--rule') } },
      rightPriceScale: { borderColor: cssVar('--rule') },
      leftPriceScale: { visible: true, borderColor: cssVar('--rule') },
      timeScale: { borderColor: cssVar('--rule'), timeVisible: true, secondsVisible: false },
    });
    const bars = chart.addSeries(HistogramSeries, { color: cssVar('--accent'), priceFormat: { type: 'price', precision: 0, minMove: 1 }, priceScaleId: 'right' });
    bars.setData(series.map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.rewardUsd })));
    const line = chart.addSeries(LineSeries, { color: cssVar('--focus'), lineWidth: 2, priceScaleId: 'left', priceFormat: { type: 'price', precision: 0, minMove: 1 }, lastValueVisible: false });
    line.setData(series.map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.usdPer1MPaperPerDay })));
    chart.timeScale().fitContent();
    $('rewards-caption').textContent = `Bars (right axis): USDC paid to stakers per hour. Line (left axis): that hour's pace as USDC per 1M PAPER per day. ${usd(s.yield.cumulativeRewardsUsd, 0)} distributed in total.`;
  }

  $('windows-body').innerHTML = s.yield.windows
    .map(
      (w) => `<tr>
        <th scope="row">${esc(w.label)}${w.complete ? '' : '<span class="tag">partial</span>'}</th>
        <td>${esc(w.hoursCovered.toFixed(1))} h</td>
        <td class="num">${esc(usd(w.rewardsUsd, 0))}</td>
        <td class="num">${esc(usd(w.usdPer1MPaperPerDay))}</td></tr>`,
    )
    .join('');
  $('method-text').textContent = s.yield.method;
  $('pricing-text').textContent = s.yield.pricing;
  $('recon-text').textContent = `Cross-check: summing this method's reward per PAPER lands ${pct(Math.abs(s.yield.reconstructionError), 1)} ${s.yield.reconstructionError >= 0 ? 'above' : 'below'} the contract's accRewardPerShare. Hourly buckets hide intra-hour stake changes, so a few percent of drift is expected.`;
}

function renderApr() {
  if (!snapshot) return;
  const input = $<HTMLInputElement>('apr-price');
  const raw = input.value.trim();
  const out = $('apr-out');
  if (raw === '') {
    out.innerHTML = '<div><dt>Implied APR</dt><dd>Enter a price to compute</dd></div>';
    return;
  }
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) {
    input.setAttribute('aria-invalid', 'true');
    out.innerHTML = '<div><dt>Implied APR</dt><dd class="warn">Enter a price above zero</dd></div>';
    return;
  }
  input.removeAttribute('aria-invalid');
  out.innerHTML =
    snapshot.yield.windows
      .map((w) => {
        const apr = aprPercent(w.usdPer1MPaperPerDay, price);
        return fact(`${w.label} pace${w.complete ? '' : ' (partial)'}`, apr === null ? 'n/a' : `${apr.toLocaleString(undefined, { maximumFractionDigits: 1 })}% APR`);
      })
      .join('') + '<div><dt>Basis</dt><dd>Simple, not compounded. Rewards are USDC.</dd></div>';
}

async function loadClaims() {
  const body = $('claims-body');
  try {
    const c = await getJson<ClaimsSummary>('/api/staking/claims?hours=24');
    if (c.claims === 0) {
      body.innerHTML = '<p class="muted">No claims in the last 24 hours.</p>';
      return;
    }
    const max = Math.max(...c.buckets.map((b) => b.claimedUsd), 1);
    const bw = 300 / c.buckets.length;
    const bars = c.buckets.map((b, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(40 - (b.claimedUsd / max) * 40).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${((b.claimedUsd / max) * 40).toFixed(1)}" fill="currentColor"/>`).join('');
    body.innerHTML = `<div class="svg-chart"><svg viewBox="0 0 300 44" role="img" aria-label="USDC claimed per hour, last 24 hours" class="claims-spark">${bars}</svg></div>
      <dl class="facts">${fact('USDC claimed', usd(c.totalClaimedUsd))}${fact('Claims', c.claims.toLocaleString())}${fact('Unique claimers', c.uniqueClaimers.toLocaleString())}${fact('Largest claim', usd(c.largestClaimUsd))}</dl>
      <p class="muted small">Read from PaperStaking Claimed events on HyperEVM. Claiming is a choice, so this is not the same as USDC distributed.</p>`;
  } catch (err) {
    body.innerHTML = errorBox('Claims unavailable', err instanceof Error ? err.message : String(err), 'retry-claims');
    $('retry-claims').addEventListener('click', () => void loadClaims());
  }
}

// Calculator

function renderCalculator() {
  if (!snapshot) return;
  const lossRaw = $<HTMLInputElement>('calc-loss').value.trim().replace(/,/g, '');
  const err = $('calc-error');
  const out = $('calc-out');
  const loss = Number(lossRaw);
  if (lossRaw === '' || !Number.isFinite(loss) || loss <= 0) {
    err.textContent = 'Enter a loss above zero, for example 1000.';
    err.hidden = false;
    out.innerHTML = '';
    return;
  }
  err.hidden = true;
  const liquidated = (document.querySelector('input[name="calc-kind"]:checked') as HTMLInputElement).value === 'liq';
  const w = window24(snapshot);
  const proj = projectLoss({ lossUsd: loss, liquidated, rate: snapshot.mint.rate, usdPer1MPaperPerDay: w.usdPer1MPaperPerDay });
  out.innerHTML = [
    fact('Mint basis', `${usd(proj.mintBasisUsd)} (${liquidated ? 'full margin' : '98% of the loss'})`),
    fact('Mint rate', `${proj.rate.toFixed(2)} PAPER per $1`),
    fact('PAPER minted', `${paperFmt(proj.paperMinted)} PAPER`, 'good'),
    fact('Yield pace used', `${usd(w.usdPer1MPaperPerDay)} per 1M PAPER per day`),
    fact('Staked earnings per day', usd(proj.usdPerDay)),
    fact('Staked earnings per year', usd(proj.usdPerYear)),
    fact('Days to earn back the loss', proj.breakEvenDays === null ? 'n/a' : proj.breakEvenDays > 36500 ? 'More than 100 years' : Math.round(proj.breakEvenDays).toLocaleString()),
  ].join('');
  $('calc-note').textContent = `Uses today's marginal mint rate and the realized ${w.label} pace${w.complete ? '' : ' (partial history)'}. Both move: each mint advances tail progress and lowers the rate for later losses, and the pace changes with revenue and with how much PAPER is staked. Minting is not compensation for the loss.`;
}

// Wallet

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EIP1193Provider;
}

const providers = new Map<string, Eip6963Detail>();
let activeProvider: EIP1193Provider | null = null;
let account: Address | null = null;
let readOnly = true;
let walletState: WalletState | null = null;
let streamStatus: WalletStreamStatus | 'idle' = 'idle';
let streamDetail = '';
let stopStream: (() => void) | null = null;
let chainRead: { pendingRewardRaw: bigint; paperBalanceRaw: bigint } | null = null;
let chainError = '';
let chainTimer: ReturnType<typeof setInterval> | undefined;
let trader: PapertradeTrader | null = null;

interface TrackedIntent {
  intentId: Hex;
  action: Action;
  label: string;
  state: string;
  outcome: IntentOutcome | null;
  queued: boolean;
}
const intents: TrackedIntent[] = [];

function renderProviders() {
  const el = $('wallet-providers');
  el.textContent = '';
  if (providers.size === 0) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = 'No browser wallet detected. You can still look up any address below.';
    el.append(p);
    return;
  }
  for (const detail of providers.values()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn provider';
    if (/^data:image\/(png|svg\+xml|webp|jpeg|gif)[;,]/.test(detail.info.icon)) {
      const img = document.createElement('img');
      img.src = detail.info.icon;
      img.alt = '';
      b.append(img);
    }
    b.append(document.createTextNode(`Connect ${detail.info.name.slice(0, 40)}`));
    b.addEventListener('click', () => void connect(detail));
    el.append(b);
  }
}

function discoverWallets() {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const detail = (e as CustomEvent<Eip6963Detail>).detail;
    if (!detail?.info?.uuid || providers.has(detail.info.uuid)) return;
    providers.set(detail.info.uuid, detail);
    renderProviders();
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  renderProviders();
}

function setWalletChip(text: string, kind: 'ok' | 'wait' | 'bad' | 'idle') {
  const el = $('wallet-state');
  el.textContent = text;
  el.className = `chip chip-${kind}`;
}

async function connect(detail: Eip6963Detail) {
  try {
    const accounts = (await detail.provider.request({ method: 'eth_requestAccounts' })) as string[];
    if (!accounts[0] || !isAddress(accounts[0])) throw new Error('The wallet returned no account.');
    activeProvider = detail.provider;
    readOnly = false;
    const handler = (next: unknown) => {
      const a = (next as string[])[0];
      if (a && isAddress(a)) void startWallet(getAddress(a).toLowerCase() as Address, false);
      else resetWallet();
    };
    detail.provider.on?.('accountsChanged', handler);
    await startWallet(accounts[0].toLowerCase() as Address, false);
  } catch (err) {
    const code = (err as { code?: number }).code;
    setWalletChip(code === 4001 ? 'Connection was rejected in the wallet' : `Could not connect: ${err instanceof Error ? err.message : String(err)}`, 'bad');
  }
}

function resetWallet() {
  stopStream?.();
  stopStream = null;
  if (chainTimer) clearInterval(chainTimer);
  account = null;
  walletState = null;
  chainRead = null;
  trader = null;
  streamStatus = 'idle';
  setWalletChip('No wallet selected', 'idle');
  renderWallet();
}

async function startWallet(address: Address, watchOnly: boolean) {
  stopStream?.();
  if (chainTimer) clearInterval(chainTimer);
  account = address;
  readOnly = watchOnly;
  if (watchOnly) activeProvider = null;
  walletState = null;
  chainRead = null;
  chainError = '';
  streamStatus = 'connecting';
  streamDetail = '';
  trader = null;
  if (!watchOnly && activeProvider) {
    const walletClient = createWalletClient({ account: address, transport: custom(activeProvider) });
    trader = new PapertradeTrader({
      user: address,
      client,
      wallet: {
        address,
        signTypedData: (args) =>
          walletClient.signTypedData({ account: address, domain: args.domain, types: args.types, primaryType: args.primaryType, message: args.message } as Parameters<typeof walletClient.signTypedData>[0]),
      },
      nonceStorage: safeStorage(),
    });
  }
  setWalletChip(`${watchOnly ? 'Watching' : 'Connected'} ${shortAddr(address)}`, 'ok');
  renderWallet();
  stopStream = streamWallet({
    wallet: address,
    baseUrl: '/api/papertrade',
    onState: (state) => {
      walletState = state;
      trackIntents(state);
      renderWallet();
    },
    onStatus: (status, detail) => {
      streamStatus = status;
      streamDetail = detail ?? '';
      renderWallet();
    },
  });
  await loadChainWallet();
  chainTimer = setInterval(() => {
    if (!document.hidden) void loadChainWallet();
  }, 30_000);
}

function safeStorage() {
  try {
    const key = '__papertrade_yield_probe__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return localStorage;
  } catch {
    return undefined;
  }
}

async function loadChainWallet() {
  if (!account) return;
  const who = account;
  try {
    const r = await getJson<{ pendingRewardRaw: string; paperBalanceRaw: string }>(`/api/staking/wallet?address=${who}`);
    if (account !== who) return;
    chainRead = { pendingRewardRaw: BigInt(r.pendingRewardRaw), paperBalanceRaw: BigInt(r.paperBalanceRaw) };
    chainError = '';
  } catch (err) {
    chainError = err instanceof Error ? err.message : String(err);
  }
  renderWallet();
}

function streamPending(state: WalletState): bigint | null {
  if (!snapshot) return null;
  return pendingStakingRewardRaw({
    stakedRaw: state.paper.staked,
    accRewardPerShareRaw: BigInt(snapshot.protocol.accRewardPerShareRaw),
    rewardDebtRaw: state.paper.rewardDebt,
    pendingBaseRaw: state.paper.pendingBase,
  });
}

function streamNote(): string {
  if (streamStatus === 'live') return 'Live stream';
  if (streamStatus === 'reconnecting') return `Stream reconnecting${streamDetail ? ` (${streamDetail})` : ''}`;
  if (streamStatus === 'connecting') return 'Connecting to the live stream';
  return 'Stream stopped';
}

function renderWallet() {
  const view = $('wallet-view');
  const empty = $('wallet-empty');
  if (!account) {
    view.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  view.hidden = false;
  const apiPending = walletState && streamPending(walletState);
  const cells: string[] = [];
  const waiting = streamStatus === 'reconnecting' ? 'Waiting for stream' : 'Loading';
  const held = walletState ? walletState.paper.balance : chainRead?.paperBalanceRaw ?? null;
  cells.push(held === null ? stat('PAPER held', waiting, 'Not staked') : stat('PAPER held', paperFmt(wad(held)), 'Not staked'));
  cells.push(walletState ? stat('PAPER staked', paperFmt(wad(walletState.paper.staked)), snapshot && snapshot.protocol.paperStaked > 0 ? `${shareOf(wad(walletState.paper.staked) / snapshot.protocol.paperStaked)} of the pool` : '', 'good') : stat('PAPER staked', waiting, streamNote()));
  cells.push(
    stat(
      'Pending rewards (stream)',
      apiPending === null || apiPending === undefined ? waiting : usd(wad(apiPending), 4),
      'pendingBase + staked x acc / 1e27 - rewardDebt, using the API accumulator',
    ),
  );
  cells.push(
    stat(
      'Pending rewards (on chain)',
      chainRead ? usd(wad(chainRead.pendingRewardRaw), 4) : chainError ? 'Unavailable' : 'Loading',
      chainError ? chainError : 'PaperStaking.pendingReward(address), the amount a claim pays now',
    ),
  );
  cells.push(walletState ? stat('Lifetime claimed', usd(wad(walletState.lifetime.paperRewardsClaimedRaw), 2), 'USDC paid out by claims') : stat('Lifetime claimed', waiting));
  if (walletState && snapshot) {
    const perDay = dailyEarnings(wad(walletState.paper.staked), window24(snapshot).usdPer1MPaperPerDay);
    cells.push(stat('Estimated per day', usd(perDay, 4), `At the realized ${window24(snapshot).label} pace of ${usd(window24(snapshot).usdPer1MPaperPerDay)} per 1M PAPER. An estimate, not a promise.`));
  } else {
    cells.push(stat('Estimated per day', waiting));
  }
  $('wallet-grid').innerHTML = cells.join('');
  const note = $('actions-note');
  note.textContent = readOnly
    ? 'Read-only: you are looking up an address. Connect a wallet to act. This page cannot sign for you.'
    : `Connected as ${shortAddr(account)}. Each action is signed in your wallet, never here. ${streamNote()}.`;
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.action button')) btn.disabled = readOnly;
  renderIntents();
}

// Actions

const ACTION_COPY: Record<Action, { title: string; type: string }> = {
  stake: { title: 'Stake PAPER', type: 'Stake' },
  unstake: { title: 'Unstake PAPER', type: 'Unstake' },
  claim: { title: 'Claim USDC rewards', type: 'Claim' },
};

const REASONS: Record<string, string> = {
  paperBalance: 'You do not hold enough unstaked PAPER for this stake.',
  stakedBalance: 'You do not have enough staked PAPER for this unstake.',
  noRewards: 'There are no staking rewards to claim yet.',
  below_minimum_paper_stake: 'That is below the minimum stake.',
};

function describeError(err: unknown): string {
  if (err instanceof PapertradeApiError) {
    const reason = err.reason ? (REASONS[err.reason] ?? `Refused: ${err.reason}.`) : '';
    if (err.code === 'admission_rejected') return reason || 'The relayer refused this intent.';
    if (err.code === 'unauthorized_intent') return 'The relayer could not match the signature to your address. Reconnect the wallet and try again.';
    if (err.code === 'rate_limited') return `Rate limited. Try again in ${Math.ceil((err.retryAfterMs ?? 30_000) / 1000)} seconds.`;
    return `${err.code}${err.reason ? ` (${err.reason})` : ''}: ${err.message}`;
  }
  const code = (err as { code?: number }).code;
  if (code === 4001) return 'You rejected the request in your wallet. Nothing was sent.';
  return err instanceof Error ? err.message : String(err);
}

function parseAmount(raw: string): bigint | string {
  const v = raw.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,18})?$/.test(v)) return 'Enter a positive amount with at most 18 decimals.';
  const n = parseUnits(v, 18);
  return n > 0n ? n : 'Enter an amount above zero.';
}

function validate(action: Action, amountText: string): { amount?: bigint; error?: string } {
  if (!snapshot) return { error: 'Protocol data is still loading.' };
  if (action === 'claim') {
    const pending = chainRead?.pendingRewardRaw ?? (walletState ? streamPending(walletState) : null);
    return pending !== null && pending === 0n ? { error: 'You have no pending rewards to claim.' } : {};
  }
  const parsed = parseAmount(amountText);
  if (typeof parsed === 'string') return { error: parsed };
  if (action === 'stake') {
    const min = parseUnits(String(snapshot.protocol.minimumStakePaper), 18);
    if (parsed < min) return { error: `The minimum stake is ${paperFmt(snapshot.protocol.minimumStakePaper)} PAPER.` };
    const held = walletState?.paper.balance ?? chainRead?.paperBalanceRaw;
    if (held !== undefined && parsed > held) return { error: `You hold ${paperFmt(wad(held))} PAPER.` };
  } else {
    const staked = walletState?.paper.staked;
    if (staked === undefined) return { error: 'Waiting for the live stream to report your staked PAPER.' };
    if (parsed > staked) return { error: `You have ${paperFmt(wad(staked))} PAPER staked.` };
  }
  return { amount: parsed };
}

const dialog = $<HTMLDialogElement>('confirm');
let pending: { action: Action; amount?: bigint } | null = null;

function openConfirm(action: Action, amount?: bigint) {
  if (!account) return;
  pending = { action, amount };
  const copy = ACTION_COPY[action];
  const deadline = new Date(Date.now() + INTENT_TTL_SECONDS * 1000);
  const domain = paperStakingDomain();
  $('confirm-title').textContent = copy.title;
  $('confirm-lede').textContent =
    'Review exactly what your wallet will be asked to sign. This page never sees your key; the signed intent goes to the Papertrade relayer.';
  const rows = [
    fact('Action', copy.title),
    fact('Typed data', `${copy.type}(address user${amount !== undefined ? ', uint256 amount' : ''}, uint256 nonce, uint64 deadline)`),
    fact('Signer (user)', account),
  ];
  if (amount !== undefined) rows.push(fact('Amount', `${formatUnits(amount, 18)} PAPER (${amount.toString()} wad)`));
  rows.push(
    fact('Nonce lane', 'paper'),
    fact('Nonce', 'Allocated at signing: a random seed, +1 per intent, kept in this browser'),
    fact('Deadline', `${deadline.toLocaleString()} (${INTENT_TTL_SECONDS / 60} minutes from now, set when you sign)`),
    fact('Domain', `${domain.name} v${domain.version}, chain ${domain.chainId}`),
    fact('Verifying contract', domain.verifyingContract),
    fact('Submitted to', `${MAINNET.apiUrl}/intents`),
  );
  $('confirm-facts').innerHTML = rows.join('');
  $('confirm-error').hidden = true;
  const go = $<HTMLButtonElement>('confirm-go');
  go.disabled = false;
  go.textContent = 'Sign in wallet and submit';
  dialog.showModal();
}

async function ensureHyperEvm(provider: EIP1193Provider) {
  const id = (await provider.request({ method: 'eth_chainId' })) as string;
  if (Number(BigInt(id)) === MAINNET.chainId) return;
  const hex = `0x${MAINNET.chainId.toString(16)}`;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (err) {
    if ((err as { code?: number }).code !== 4902) throw err;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hex,
          chainName: MAINNET.network.chainName,
          nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
          rpcUrls: [MAINNET.network.rpcUrl],
          blockExplorerUrls: [MAINNET.network.explorerUrl],
        },
      ],
    });
  }
}

async function confirmAndSubmit() {
  if (!pending || !trader || !activeProvider) return;
  const { action, amount } = pending;
  const go = $<HTMLButtonElement>('confirm-go');
  const errEl = $('confirm-error');
  errEl.hidden = true;
  go.disabled = true;
  try {
    go.textContent = 'Check wallet network';
    await ensureHyperEvm(activeProvider);
    go.textContent = 'Waiting for your signature';
    const amountText = amount === undefined ? undefined : formatUnits(amount, 18);
    const prepared =
      action === 'stake' ? await trader.prepareStake(amountText!) : action === 'unstake' ? await trader.prepareUnstake(amountText!) : await trader.prepareClaim();
    go.textContent = 'Submitting';
    const submitted: SubmittedIntent = await trader.submit(prepared);
    intents.unshift({ intentId: submitted.intentId, action, label: prepared.summary, state: String(submitted.receipt.state), outcome: null, queued: false });
    dialog.close();
    renderIntents();
    $('intents-title').scrollIntoView({ block: 'nearest' });
  } catch (err) {
    errEl.textContent = describeError(err);
    errEl.hidden = false;
    go.disabled = false;
    go.textContent = 'Try again';
  }
}

function trackIntents(state: WalletState) {
  for (const t of intents) {
    t.queued = state.operations.some((op: PendingOperation) => op.intentId.toLowerCase() === t.intentId.toLowerCase());
  }
  for (const o of state.intentOutcomes) {
    const t = intents.find((i) => i.intentId.toLowerCase() === o.intentId.toLowerCase());
    if (t) t.outcome = o.outcome;
  }
}

function renderIntents() {
  const list = $('intent-list');
  if (intents.length === 0) {
    list.innerHTML = '<p class="muted">Intents you submit appear here and update from the live stream.</p>';
    return;
  }
  list.innerHTML = intents
    .map((t) => {
      const status = t.outcome
        ? t.outcome === 'succeeded' ? 'Succeeded on chain' : `Ended: ${t.outcome}`
        : t.queued ? 'Queued in the relayer' : `Accepted (${t.state})`;
      const kind = t.outcome === 'succeeded' ? 'ok' : t.outcome ? 'bad' : 'wait';
      return `<div class="intent"><div class="row"><strong>${esc(t.label)}</strong><span class="chip chip-${kind}">${esc(status)}</span></div><code>${esc(t.intentId)}</code></div>`;
    })
    .join('');
}

function wireActions() {
  for (const form of document.querySelectorAll<HTMLFormElement>('form.action')) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const action = form.dataset.action as Action;
      const errEl = form.querySelector<HTMLElement>('.error-text')!;
      const input = form.querySelector<HTMLInputElement>('input[type="text"]');
      const result = validate(action, input?.value ?? '');
      if (result.error) {
        errEl.textContent = result.error;
        errEl.hidden = false;
        input?.setAttribute('aria-invalid', 'true');
        return;
      }
      errEl.hidden = true;
      input?.removeAttribute('aria-invalid');
      openConfirm(action, result.amount);
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-max]')) {
    b.addEventListener('click', () => {
      const which = b.dataset.max;
      const value = which === 'stake' ? (walletState?.paper.balance ?? chainRead?.paperBalanceRaw) : walletState?.paper.staked;
      const input = $<HTMLInputElement>(`${which}-amount`);
      if (value !== undefined) input.value = formatUnits(value, 18);
      input.focus();
    });
  }
  $('confirm-go').addEventListener('click', () => void confirmAndSubmit());
  dialog.addEventListener('close', () => {
    pending = null;
  });
}

function wireWatch() {
  $('watch-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('watch-input');
    const err = $('watch-error');
    const v = input.value.trim();
    if (!isAddress(v, { strict: false })) {
      err.textContent = 'That is not a valid 0x address (42 characters).';
      err.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    err.hidden = true;
    input.removeAttribute('aria-invalid');
    void startWallet(v.toLowerCase() as Address, true);
  });
}

async function loadAll() {
  $('hero-stat').innerHTML = '<div class="skeleton skeleton-big" aria-hidden="true"></div>';
  await Promise.all([loadSnapshot(), loadClaims()]);
}

function init() {
  discoverWallets();
  wireWatch();
  wireActions();
  $('apr-price').addEventListener('input', renderApr);
  $('calc-form').addEventListener('input', renderCalculator);
  $('calc-form').addEventListener('submit', (e) => e.preventDefault());
  $('refresh').addEventListener('click', () => void loadAll());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => snapshot && renderRewards(snapshot));
  setInterval(() => {
    if (!document.hidden) void loadSnapshot();
  }, 60_000);
  renderIntents();
  void loadAll();
}

init();
