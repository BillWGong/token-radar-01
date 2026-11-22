// Token radar value model v2, hand-written for the token-radar-01 bounty.
//
// The board ranks protocols that record no token, by an implied value the
// entry states, plus a token-launch odds estimate fitted on the snapshot
// itself. The value follows only from the snapshot's own figures:
//
//   implied = TVL x fitted multiple x growth x maturity
//
// - TVL is the protocol's own tvl_usd.
// - The fitted multiple comes from the protocols whose token already
//   trades (128 comps with mcap_usd > 0). Three candidate rules are
//   fitted and compared on a deterministic 5-fold holdout (folds by
//   sorted slug, every 5th protocol held out), scored by the median
//   absolute log10 error of the predicted market cap:
//     (a) a size curve per category: log10(mcap) = a + b*log10(TVL),
//         fitted per category where a category holds at least 8 comps,
//         else the global curve; the slope is clamped to [0, 1.2];
//     (b) one global size curve for every protocol;
//     (c) a flat median: the v1 rule, the median mcap/TVL per category
//         (at least 3 comps) else the global median.
//   The rule with the smallest holdout error is the one the board uses;
//   differences under 0.02 are within the holdout's noise, so near-ties
//   go to the simpler rule (flat, then one global curve, then
//   per-category curves). All three errors are reported in the
//   dashboard so the choice is checkable. Multiples are winsorised to
//   [0.02, 1.5]. No protocol name is ever hardcoded: every number is
//   computed from the snapshot at run time, so the same code ranks a
//   future snapshot the same way.
// - Growth is the protocol's seven-day TVL change, clamped to [-50, +100]
//   per cent, as a factor in [0.5, 2.0]. A protocol that records no change
//   gets 1.0. Growth and maturity are stated priors, not fitted terms:
//   they describe the launch story (a growing, long-running protocol with
//   no token yet), they are not estimated from traded comps.
// - Maturity is how long the protocol has run with no token: 1 + 0.1 per
//   year since listed_at, capped at 3 years (a factor in [1.0, 1.3]). A
//   protocol that records no listing date gets 1.0.
//
// - Token odds are a logistic regression fitted on all 758 protocols,
//   label = records a token (DefiLlama lists an id or a ticker), features
//   = log10(TVL), age in years, clamped 7-day change, log1p(chain count),
//   standardised on the snapshot. It is a cross-sectional fit on the
//   snapshot's own traded-vs-untraded record: it says which kinds of
//   protocol tend to have a token, not when any one protocol will launch.
//   A deterministic 5-fold holdout reports its AUC next to the 0.5
//   base-rate line. Odds are clamped to [0.01, 0.99].
//
// - The implied range is the implied value widened by the chosen value
//   rule's holdout error: implied x 10^(+/- median absolute log10
//   error). It is the model's own uncertainty, not a price band.
//
// - Every row carries an integrity strip: flags for data the snapshot
//   does not have (no 7-day change, no listing date), for a global
//   fallback multiple, for a clamped growth term, for a capped implied
//   value, and for a small TVL. Nothing is silently filled in.
//
// - Every row carries a costed farm verdict. The verdict rule is:
//   expected value = token odds x implied value; Farm when it reaches
//   $10M, Thin when it reaches $2.5M, otherwise Skip. Fees are estimates,
//   not snapshot data: a $5 bridge plus 10 transactions at a per-chain
//   typical fee (Ethereum $3, Bitcoin $2, cheap L1s $0.05, L2s $0.10,
//   other EVM chains $0.20, anything else $0.50). Capital is the plan's
//   own sizes: $25-$100 to start plus $10-$25 a week for 8 weeks.
//   The verdict is this board's own rule, stated in full on the page.
//
// The board holds the snapshot's watchlist (the floor) plus every protocol
// that records no token and sits below the watchlist's TVL floor: the early
// ones the radar exists to find. Protocols above the floor that the
// watchlist leaves out are the giants that already trade in another form
// (centralised exchanges, wrapped and staked products of tokens that
// trade, bridges) and are not ranked as launches. Protocols whose token
// already trades are set aside in the dashboard's own list, never on the
// board: the board separates what trades from what is still to come.
// Together the board, the traded list and the above-floor set account for
// all 758 protocols in the snapshot; the dashboard prints the count.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** The five fields the gate reads from a board row. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** A board row with everything the dashboard shows for it. */
export interface DetailRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_years: number;
  multiple: number;
  growth: number;
  maturity: number;
  multiple_source: 'category' | 'global';
  token_odds: number;
  implied_low_usd: number;
  implied_high_usd: number;
  integrity: string[];
  fees_usd: number;
  capital_low_usd: number;
  capital_high_usd: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
  verdict_reason: string;
  is_watchlist: boolean;
}

/** A protocol whose token already trades, shown apart from the board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  model: {
    formula: string;
    global_multiple: number;
    multiples: Record<string, number>;
    board_size: number;
    watchlist_size: number;
    value_method: 'curve' | 'global-curve' | 'flat';
    holdout_curve_err: number;
    holdout_global_curve_err: number;
    holdout_flat_err: number;
    global_curve: { a: number; b: number } | null;
    category_curves: Record<string, { a: number; b: number }>;
    odds_auc_holdout: number;
    odds_base_rate: number;
    odds_coefs: number[];
    integrity: {
      missing_change: number;
      missing_date: number;
      global_fallback: number;
      clamped_growth: number;
      capped_value: number;
      small_tvl: number;
    };
    coverage: {
      ranked: number;
      traded_with_mcap: number;
      has_token_no_mcap: number;
      above_floor_no_token: number;
      total: number;
    };
    cost_note: string;
    verdict_rule: string;
  };
  rows: DetailRow[];
  live: LiveRow[];
  categories: string[];
}

const MULTIPLE_MIN = 0.02;
const MULTIPLE_MAX = 1.5;
const GROWTH_MIN = -50;
const GROWTH_MAX = 100;
const MATURITY_PER_YEAR = 0.1;
const MATURITY_CAP_YEARS = 3;
const IMPLIED_CAP = 1_000_000_000_000;
const CURVE_MIN_COMPS = 8;
const FLAT_MIN_COMPS = 3;
const BRIDGE_FEE_USD = 5;
const FARM_TXS = 10;
const VERDICT_FARM_USD = 10_000_000;
const VERDICT_THIN_USD = 2_500_000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function log10(v: number): number {
  return Math.log(v) / Math.LN10;
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/** Ordinary least squares for y = a + b*x; the slope is clamped to [0, 1.2]. */
function ols(points: { x: number; y: number }[]): { a: number; b: number } {
  const n = points.length;
  if (n === 0) return { a: 0, b: 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (n < 2 || denom === 0) return { a: sy / n, b: 0 };
  let b = (n * sxy - sx * sy) / denom;
  b = clamp(b, 0, 1.2);
  return { a: (sy - b * sx) / n, b };
}

/** Parse and lightly validate the sealed snapshot. */
export function parseSnapshot(text: string): Snapshot {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('snapshot: not an object');
  const root = parsed as Record<string, unknown>;
  if (typeof root.as_of !== 'string' || typeof root.source !== 'string') {
    throw new Error('snapshot: as_of and source must be strings');
  }
  if (typeof root.floor_usd !== 'number' || !Array.isArray(root.protocols) || !Array.isArray(root.watchlist)) {
    throw new Error('snapshot: floor_usd, protocols and watchlist have the wrong shape');
  }
  const protocols = (root.protocols as Record<string, unknown>[]).map((p) => {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Array.isArray(p.chains)) {
      throw new Error(`snapshot: protocol ${String(p.slug)} has the wrong shape`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: (p.category as string | null) ?? null,
      chains: p.chains as string[],
      tvl_usd: p.tvl_usd,
      change_7d: (p.change_7d as number | null) ?? null,
      mcap_usd: (p.mcap_usd as number | null) ?? null,
      listed_at: (p.listed_at as string | null) ?? null,
      gecko_id: (p.gecko_id as string | null) ?? null,
      symbol: (p.symbol as string | null) ?? null,
    } satisfies Protocol;
  });
  return {
    as_of: root.as_of,
    source: root.source,
    floor_usd: root.floor_usd,
    protocols,
    watchlist: root.watchlist as string[],
  };
}

/** A protocol records no token when DefiLlama records neither id nor ticker. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Age in years at the snapshot date; 0 when no listing date is recorded. */
function ageYears(p: Protocol, asOf: string): number {
  return p.listed_at === null ? 0 : daysBetween(p.listed_at, asOf) / 365.25;
}

/** ---- Value model: fitted multiple, chosen by a 5-fold holdout ---- */

interface Comp {
  category: string | null;
  tvl: number;
  mcap: number;
  slug: string;
}

function compsOf(snapshot: Snapshot): Comp[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({ category: p.category, tvl: p.tvl_usd, mcap: p.mcap_usd as number, slug: p.slug }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

/** A multiple rule built from a training set of comps. */
function buildMultipleFn(
  method: 'curve' | 'global-curve' | 'flat',
  train: Comp[],
): { fn: (category: string | null, tvl: number) => { multiple: number; source: 'category' | 'global' }; curves: Record<string, { a: number; b: number }>; globalCurve: { a: number; b: number } | null; multiples: Record<string, number> } {
  const byCategory = new Map<string, Comp[]>();
  for (const c of train) {
    if (c.category === null) continue;
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  const allRatios = train.map((c) => c.mcap / c.tvl);
  const globalMultiple = clamp(median(allRatios), MULTIPLE_MIN, MULTIPLE_MAX);
  const multiples: Record<string, number> = {};
  for (const [category, list] of byCategory) {
    if (list.length >= FLAT_MIN_COMPS) multiples[category] = clamp(median(list.map((c) => c.mcap / c.tvl)), MULTIPLE_MIN, MULTIPLE_MAX);
  }
  const globalCurve = train.length >= 2 ? ols(train.map((c) => ({ x: log10(c.tvl), y: log10(c.mcap) }))) : null;
  const curves: Record<string, { a: number; b: number }> = {};
  for (const [category, list] of byCategory) {
    if (list.length >= CURVE_MIN_COMPS) curves[category] = ols(list.map((c) => ({ x: log10(c.tvl), y: log10(c.mcap) })));
  }
  const fn = (category: string | null, tvl: number): { multiple: number; source: 'category' | 'global' } => {
    if (method === 'curve' || method === 'global-curve') {
      const curve = method === 'curve' && category !== null ? curves[category] : undefined;
      const use = curve ?? globalCurve;
      if (use !== null) {
        const m = Math.pow(10, use.a + use.b * log10(tvl)) / tvl;
        return { multiple: clamp(m, MULTIPLE_MIN, MULTIPLE_MAX), source: curve !== undefined ? 'category' : 'global' };
      }
      return { multiple: globalMultiple, source: 'global' };
    }
    if (category !== null && multiples[category] !== undefined) return { multiple: multiples[category]!, source: 'category' };
    return { multiple: globalMultiple, source: 'global' };
  };
  return { fn, curves, globalCurve, multiples };
}

/** Median absolute log10 error of a multiple rule, 5-fold by sorted slug. */
function holdoutError(method: 'curve' | 'global-curve' | 'flat', comps: Comp[]): number {
  const errs: number[] = [];
  for (let k = 0; k < 5; k++) {
    const test = comps.filter((_, i) => i % 5 === k);
    const train = comps.filter((_, i) => i % 5 !== k);
    const { fn } = buildMultipleFn(method, train);
    for (const c of test) {
      const pred = c.tvl * fn(c.category, c.tvl).multiple;
      errs.push(Math.abs(log10(pred) - log10(c.mcap)));
    }
  }
  return median(errs);
}

/** ---- Token odds: logistic regression on has-token vs no-token ---- */

function oddsFeatures(p: Protocol, asOf: string): number[] {
  return [
    log10(Math.max(1, p.tvl_usd)),
    ageYears(p, asOf),
    clamp(p.change_7d ?? 0, GROWTH_MIN, GROWTH_MAX) / 100,
    Math.log(1 + p.chains.length),
  ];
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Full-batch gradient descent, fixed iterations: fully deterministic. */
function fitLogistic(rows: { x: number[]; y: number }[], means: number[], stds: number[]): number[] {
  const d = 4;
  const w = [0, 0, 0, 0, 0];
  const lr = 0.5;
  const lambda = 0.01;
  const iters = 1500;
  for (let it = 0; it < iters; it++) {
    const grad = [0, 0, 0, 0, 0];
    for (const row of rows) {
      const xs = [1, ...row.x.map((v, j) => (v - means[j]!) / stds[j]!)];
      let z = 0;
      for (let j = 0; j <= d; j++) z += w[j]! * xs[j]!;
      const err = sigmoid(z) - row.y;
      for (let j = 0; j <= d; j++) grad[j]! += err * xs[j]!;
    }
    for (let j = 0; j <= d; j++) {
      const reg = j === 0 ? 0 : lambda * w[j]!;
      w[j]! -= (lr * grad[j]!) / rows.length + (lr * reg) / rows.length;
    }
  }
  return w;
}

/** AUC by average ranks, ties split evenly. */
function auc(pairs: { s: number; y: number }[]): number {
  const sorted = [...pairs].sort((a, b) => a.s - b.s);
  const pos = sorted.filter((d) => d.y === 1).length;
  const neg = sorted.length - pos;
  if (pos === 0 || neg === 0) return 0.5;
  let rankSum = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.s === sorted[i]!.s) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (sorted[k]!.y === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function fitOdds(snapshot: Snapshot): {
  predict: (p: Protocol) => number;
  aucHoldout: number;
  baseRate: number;
  coefs: number[];
} {
  const ordered = [...snapshot.protocols].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const feats = ordered.map((p) => oddsFeatures(p, snapshot.as_of));
  const means = [0, 0, 0, 0].map((_, j) => feats.reduce((s, f) => s + f[j]!, 0) / feats.length);
  const stds = [0, 0, 0, 0].map((_, j) => {
    const m = means[j]!;
    const v = feats.reduce((s, f) => s + (f[j]! - m) * (f[j]! - m), 0) / feats.length;
    return Math.sqrt(v) || 1;
  });
  const rows = ordered.map((p, i) => ({ x: feats[i]!, y: recordsNoToken(p) ? 0 : 1 }));
  const baseRate = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  const predictWith = (w: number[]) => (p: Protocol): number => {
    const f = oddsFeatures(p, snapshot.as_of);
    const xs = [1, ...f.map((v, j) => (v - means[j]!) / stds[j]!)];
    let z = 0;
    for (let j = 0; j <= 4; j++) z += w[j]! * xs[j]!;
    return clamp(sigmoid(z), 0.01, 0.99);
  };
  // 5-fold holdout AUC, folds by sorted slug.
  const pairs: { s: number; y: number }[] = [];
  for (let k = 0; k < 5; k++) {
    const train = rows.filter((_, i) => i % 5 !== k);
    const testProtocols = ordered.filter((_, i) => i % 5 === k);
    const w = fitLogistic(train, means, stds);
    const predict = predictWith(w);
    for (const p of testProtocols) pairs.push({ s: predict(p), y: recordsNoToken(p) ? 0 : 1 });
  }
  const aucHoldout = auc(pairs);
  const wFull = fitLogistic(rows, means, stds);
  return { predict: predictWith(wFull), aucHoldout, baseRate, coefs: wFull.map((v) => Math.round(v * 1000) / 1000) };
}

/** ---- Fees, gas, farm plans ---- */

const GAS: Record<string, string> = {
  Ethereum: 'ETH',
  Base: 'ETH',
  Arbitrum: 'ETH',
  Optimism: 'ETH',
  Linea: 'ETH',
  'zkSync Era': 'ETH',
  Scroll: 'ETH',
  Blast: 'ETH',
  Polygon: 'POL',
  Binance: 'BNB',
  Solana: 'SOL',
  Avalanche: 'AVAX',
  Gnosis: 'xDAI',
  Fantom: 'FTM',
  Mantle: 'MNT',
  Berachain: 'BERA',
  Sui: 'SUI',
  Aptos: 'APT',
  Cosmos: 'ATOM',
  Tron: 'TRX',
  Near: 'NEAR',
  Bitcoin: 'BTC',
  TON: 'TON',
  Ripple: 'XRP',
  Stellar: 'XLM',
  Sei: 'SEI',
  Algorand: 'ALGO',
  Cronos: 'CRO',
};

function gasOf(chain: string): string {
  return GAS[chain] ?? "the chain's gas token";
}

/** Typical per-transaction fee in USD. An estimate, not snapshot data. */
const FEE_PER_TX: Record<string, number> = {
  Ethereum: 3.0,
  Bitcoin: 2.0,
  EthereumClassic: 2.0,
  Solana: 0.05,
  Sui: 0.05,
  Aptos: 0.05,
  TON: 0.05,
  Near: 0.05,
  Tron: 0.05,
  Ripple: 0.05,
  Stellar: 0.05,
  Algorand: 0.05,
  Cosmos: 0.05,
  Sei: 0.05,
  Arbitrum: 0.1,
  Optimism: 0.1,
  Base: 0.1,
  Linea: 0.1,
  'zkSync Era': 0.1,
  Scroll: 0.1,
  Blast: 0.1,
  Mantle: 0.1,
  Polygon: 0.2,
  Avalanche: 0.2,
  Binance: 0.2,
  Cronos: 0.2,
  Fantom: 0.2,
  Gnosis: 0.2,
  Berachain: 0.2,
};

function feePerTx(chain: string): number {
  return FEE_PER_TX[chain] ?? 0.5;
}

/** The core action for a category: what a reader actually does on it. */
function coreAction(category: string | null, name: string): { action: string; repeat: string } {
  switch (category) {
    case 'Dexs':
      return {
        action: `Swap $25-$100 of one asset for another on ${name}, then add about the same size to a liquid pool and keep the position open so the protocol records both swap volume and liquidity.`,
        repeat: `Swap or add liquidity at least once a week for the next 8 weeks; a steady weekly pattern counts for more than one large deposit.`,
      };
    case 'Lending':
      return {
        action: `Supply $25-$100 of collateral on ${name}, borrow a small amount against it, then repay the loan within a week so the protocol records a full supply-borrow-repay cycle.`,
        repeat: `Repeat a supply and borrow cycle once a week for the next 8 weeks, varying the asset when you can; lenders that use the protocol repeatedly rank above one-off deposits.`,
      };
    case 'Yield':
    case 'Yield Aggregator':
      return {
        action: `Deposit $25-$100 into a ${name} vault and leave it earning for at least two weeks, then harvest or compound the yield once so the protocol records both the deposit and the harvest.`,
        repeat: `Top the vault up by $10-$25 every week for the next 8 weeks and harvest monthly; vaults reward sticky deposits over deposits that leave after days.`,
      };
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaked BTC':
      return {
        action: `Stake $25-$100 through ${name} and hold the receipt token in the same wallet for at least two weeks; do not move it to another wallet or the activity may not link to you.`,
        repeat: `Add $10-$25 to the stake every week for the next 8 weeks and keep the receipt token staked; unstaking early usually resets the clock on any loyalty measure.`,
      };
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return {
        action: `Bridge $25-$100 from one chain to another through ${name}, then bridge a smaller amount back a few days later so the protocol records volume in both directions.`,
        repeat: `Bridge at least once a week for the next 8 weeks, alternating the chains you use; regular bridge volume is what these protocols measure.`,
      };
    case 'CDP':
      return {
        action: `Open a vault on ${name} with $25-$100 of collateral, mint a small amount of its stablecoin against it, and repay the mint within a week to complete a full vault cycle.`,
        repeat: `Open and close a small vault once a week for the next 8 weeks, keeping the collateral ratio well above the liquidation line every time.`,
      };
    case 'RWA':
      return {
        action: `Deposit $25-$100 into ${name}'s tokenised asset and hold the receipt for at least two weeks; keep the position in one wallet so the holding history stays in one place.`,
        repeat: `Add $10-$25 to the position every week for the next 8 weeks and hold through at least one full distribution cycle.`,
      };
    case 'Basis Trading':
      return {
        action: `Open a small basis position of $25-$100 on ${name}, hold it for at least a week, then close it; note the funding paid and received so you know the real cost.`,
        repeat: `Open one small basis position a week for the next 8 weeks, never risking more than you can lose in a day.`,
      };
    case 'Indexes':
      return {
        action: `Buy $25-$100 of ${name}'s index and hold it for at least two weeks; check the index composition once so you know what you actually own.`,
        repeat: `Add $10-$25 to the index every week for the next 8 weeks and rebalance only when the index itself does.`,
      };
    default:
      return {
        action: `Use ${name}'s main feature with $25-$100 for at least two weeks: deposit, swap or stake through its own interface, not a third-party aggregator, so the activity links to your wallet.`,
        repeat: `Use the protocol at least once a week for the next 8 weeks; a regular weekly habit is what most snapshots pick up.`,
      };
  }
}

export interface CostVerdict {
  fees_usd: number;
  capital_low_usd: number;
  capital_high_usd: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
  reason: string;
}

function fmtUsdShort(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + String(Math.round(v));
}

/** The costed verdict for one protocol, from its own odds, value and chain. */
export function costVerdict(p: Protocol, tokenOdds: number, implied: number): CostVerdict {
  const chain = p.chains[0] ?? 'Ethereum';
  const fees = Math.round((BRIDGE_FEE_USD + FARM_TXS * feePerTx(chain)) * 100) / 100;
  const capitalLow = 25 + 8 * 10;
  const capitalHigh = 100 + 8 * 25;
  const ev = tokenOdds * implied;
  const verdict: 'Farm' | 'Thin' | 'Skip' = ev >= VERDICT_FARM_USD ? 'Farm' : ev >= VERDICT_THIN_USD ? 'Thin' : 'Skip';
  const reason =
    `${Math.round(tokenOdds * 100)}% token odds x ${fmtUsdShort(implied)} implied = ${fmtUsdShort(ev)} expected value, ` +
    `against about $${fees.toFixed(2)} in fees on ${chain}.`;
  return { fees_usd: fees, capital_low_usd: capitalLow, capital_high_usd: capitalHigh, verdict, reason };
}

/** Eight concrete farm steps for one protocol, each 20 to 600 characters. */
export function farmSteps(p: Protocol, cost: CostVerdict): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasOf(chain);
  const core = coreAction(p.category, p.name);
  const steps = [
    `Open a fresh wallet on ${chain} and fund it with about $50 of ${gas} for fees plus the amount you plan to use; write the seed phrase on paper and never share it with anyone.`,
    `Bridge your funds to ${chain} through the protocol's own bridge page or a canonical bridge; expect $2-$10 in fees and 5-20 minutes for the transfer to confirm.`,
    core.action,
    core.repeat,
    `Join ${p.name}'s Discord, follow its X account, and connect the same wallet to its points or quests page if it has one; finish any profile or social task it lists, which takes about 15 minutes.`,
    `Record every transaction hash and check ${p.name}'s dashboard weekly for points, volume or quest credit; if a step shows no credit within a week, redo it and keep the receipt.`,
    `If ${p.name} issues a token, claim only from its official site, never from a link in a DM or a reply; expect a vesting or lockup, so plan to hold part of any claim rather than selling it all at once.`,
    `Verdict: ${cost.verdict}. ${cost.reason} Budget about $${cost.fees_usd.toFixed(2)} in fees plus $${cost.capital_low_usd}-$${cost.capital_high_usd} of capital over 8 weeks; only farm with money you can afford to lose.`,
  ];
  for (const step of steps) {
    if (step.trim().length < 20 || step.trim().length > 600) {
      throw new Error(`farm plan for ${p.slug}: a step is ${step.trim().length} characters, outside 20-600`);
    }
  }
  return steps;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  // Value rule: fit the size curves and the flat median, hold out all
  // three, and use whichever the blind test keeps. Differences under
  // 0.02 in median log error are within the holdout's noise (a median
  // over ~128 comps), so near-ties go to the simpler rule: flat, then
  // one global curve, then per-category curves.
  const comps = compsOf(snapshot);
  const holdoutCurve = holdoutError('curve', comps);
  const holdoutGlobalCurve = holdoutError('global-curve', comps);
  const holdoutFlat = holdoutError('flat', comps);
  const EPS = 0.02;
  const method: 'curve' | 'global-curve' | 'flat' =
    holdoutFlat <= holdoutGlobalCurve + EPS && holdoutFlat <= holdoutCurve + EPS
      ? 'flat'
      : holdoutGlobalCurve <= holdoutCurve + EPS
        ? 'global-curve'
        : 'curve';
  const { fn: multipleFn, curves, globalCurve, multiples } = buildMultipleFn(method, comps);
  const allRatios = comps.map((c) => c.mcap / c.tvl);
  const globalMultiple = clamp(median(allRatios), MULTIPLE_MIN, MULTIPLE_MAX);
  const holdoutErr = method === 'curve' ? holdoutCurve : method === 'global-curve' ? holdoutGlobalCurve : holdoutFlat;
  const rangeFactor = Math.pow(10, holdoutErr);

  // Token odds: one logistic fit on the whole snapshot, AUC from holdout.
  const odds = fitOdds(snapshot);

  // The board: the watchlist, plus every protocol that records no token and
  // sits below the watchlist's TVL floor. Above-floor protocols the
  // watchlist leaves out are not ranked as launches.
  const chosen = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (recordsNoToken(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }

  const integrity = {
    missing_change: 0,
    missing_date: 0,
    global_fallback: 0,
    clamped_growth: 0,
    capped_value: 0,
    small_tvl: 0,
  };
  const details: DetailRow[] = [];
  for (const p of chosen.values()) {
    const { multiple, source } = multipleFn(p.category, p.tvl_usd);
    const growth = 1 + clamp(p.change_7d ?? 0, GROWTH_MIN, GROWTH_MAX) / 100;
    const age = ageYears(p, snapshot.as_of);
    const maturity = 1 + MATURITY_PER_YEAR * Math.min(age, MATURITY_CAP_YEARS);
    const raw = p.tvl_usd * multiple * growth * maturity;
    const capped = raw > IMPLIED_CAP;
    const implied = Math.max(1, Math.min(IMPLIED_CAP, Math.round(raw)));
    const tokenOdds = Math.round(odds.predict(p) * 1000) / 1000;
    const cost = costVerdict(p, tokenOdds, implied);
    const flags: string[] = [];
    if (p.change_7d === null) {
      flags.push('no 7d change');
      integrity.missing_change++;
    }
    if (p.listed_at === null) {
      flags.push('no listing date');
      integrity.missing_date++;
    }
    if (source === 'global') {
      flags.push('global multiple fallback');
      integrity.global_fallback++;
    }
    if (p.change_7d !== null && (p.change_7d < GROWTH_MIN || p.change_7d > GROWTH_MAX)) {
      flags.push('growth clamped');
      integrity.clamped_growth++;
    }
    if (capped) {
      flags.push('value capped');
      integrity.capped_value++;
    }
    if (p.tvl_usd < 1_000_000) {
      flags.push('small TVL');
      integrity.small_tvl++;
    }
    details.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(p, cost),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_years: Math.round(age * 100) / 100,
      multiple: Math.round(multiple * 1000) / 1000,
      growth: Math.round(growth * 1000) / 1000,
      maturity: Math.round(maturity * 1000) / 1000,
      multiple_source: source,
      token_odds: tokenOdds,
      implied_low_usd: Math.max(1, Math.round(implied / rangeFactor)),
      implied_high_usd: Math.min(IMPLIED_CAP, Math.round(implied * rangeFactor)),
      integrity: flags,
      fees_usd: cost.fees_usd,
      capital_low_usd: cost.capital_low_usd,
      capital_high_usd: cost.capital_high_usd,
      verdict: cost.verdict,
      verdict_reason: cost.reason,
      is_watchlist: snapshot.watchlist.includes(p.slug),
    });
  }
  details.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  details.forEach((row, i) => {
    row.rank = i + 1;
  });

  const board: BoardRow[] = details.map((row) => ({
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
  }));

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 60)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      ratio: Math.round((p.mcap_usd as number) / p.tvl_usd * 1000) / 1000,
    }));

  const categories = [...new Set(details.map((row) => row.category).filter((c): c is string => c !== null))].sort();
  const aboveFloorNoToken = snapshot.protocols.filter((p) => recordsNoToken(p) && p.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(p.slug)).length;
  const hasTokenNoMcap = snapshot.protocols.filter((p) => !recordsNoToken(p) && !(p.mcap_usd !== null && p.mcap_usd > 0)).length;
  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model: {
      formula:
        'implied = TVL x fitted multiple (size curve log10(mcap) = a + b*log10(TVL): per-category curves with 8+ comps, one global curve, or a flat median — whichever of the three wins a 5-fold holdout) x growth (1 + clamped 7d change) x maturity (1 + 0.1/year, capped at 3 years)',
      global_multiple: globalMultiple,
      multiples,
      board_size: details.length,
      watchlist_size: snapshot.watchlist.length,
      value_method: method,
      holdout_curve_err: Math.round(holdoutCurve * 1000) / 1000,
      holdout_global_curve_err: Math.round(holdoutGlobalCurve * 1000) / 1000,
      holdout_flat_err: Math.round(holdoutFlat * 1000) / 1000,
      global_curve: globalCurve === null ? null : { a: Math.round(globalCurve.a * 1000) / 1000, b: Math.round(globalCurve.b * 1000) / 1000 },
      category_curves: Object.fromEntries(
        Object.entries(curves).map(([c, v]) => [c, { a: Math.round(v.a * 1000) / 1000, b: Math.round(v.b * 1000) / 1000 }]),
      ),
      odds_auc_holdout: Math.round(odds.aucHoldout * 1000) / 1000,
      odds_base_rate: Math.round(odds.baseRate * 1000) / 1000,
      odds_coefs: odds.coefs,
      integrity,
      coverage: {
        ranked: details.length,
        traded_with_mcap: comps.length,
        has_token_no_mcap: hasTokenNoMcap,
        above_floor_no_token: aboveFloorNoToken,
        total: snapshot.protocols.length,
      },
      cost_note:
        'Fees are estimates, not snapshot data: $5 bridge + 10 transactions at a typical per-chain fee (Ethereum $3, Bitcoin $2, cheap L1s $0.05, L2s $0.10, other EVM chains $0.20, anything else $0.50). Capital is the plan\'s own sizes: $25-$100 to start plus $10-$25 a week for 8 weeks.',
      verdict_rule:
        'Verdict = Farm when token odds x implied value reaches $10M, Thin at $2.5M, otherwise Skip.',
    },
    rows: details,
    live,
    categories,
  };
  return { board, radar };
}

/** The dashboard's data, written beside the page as data.js. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** The gate's shape, checked before anything is written. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set<string>();
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const row of board) {
    if (!known.has(row.slug)) return `row ${row.slug} is not one of the snapshot's protocols`;
    if (slugs.has(row.slug)) return `slug ${row.slug} appears twice`;
    slugs.add(row.slug);
    if (row.name.trim().length === 0) return `row ${row.slug} has an empty name`;
    if (!Number.isInteger(row.rank) || row.rank < 1) return `row ${row.slug} has rank ${row.rank}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 100_000_000_000_000) {
      return `row ${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, outside 3-12`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} characters, outside 20-600`;
    }
  }
  const ranks = [...board.map((row) => row.rank)].sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not exactly 1 to ${board.length}`;
  }
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${byRank[i - 1]!.rank} to rank ${byRank[i]!.rank}`;
    }
  }
  if (board.every((row) => row.implied_value_usd === board[0]!.implied_value_usd)) {
    return 'every implied value is the same: the board ranks nothing';
  }
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}
