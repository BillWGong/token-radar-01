// Token radar value model, hand-written for the token-radar-01 bounty.
//
// The board ranks protocols that record no token, by an implied value the
// entry states. The value follows only from the snapshot's own figures:
//
//   implied = TVL x category multiple x growth x maturity
//
// - TVL is the protocol's own tvl_usd.
// - The category multiple is the median mcap/TVL of the protocols in the
//   same category whose token already trades (mcap_usd recorded), falling
//   back to the global median when a category has fewer than three such
//   comps. Multiples are winsorised to [0.02, 1.5]. No protocol name is
//   ever hardcoded: the multiples are computed from the snapshot at run
//   time, so the same code ranks a future snapshot the same way.
// - Growth is the protocol's seven-day TVL change, clamped to [-50, +100]
//   per cent, as a factor in [0.5, 2.0]. A protocol that records no change
//   gets 1.0.
// - Maturity is how long the protocol has run with no token: 1 + 0.1 per
//   year since listed_at, capped at 3 years (a factor in [1.0, 1.3]). A
//   protocol that records no listing date gets 1.0.
//
// The board holds the snapshot's watchlist (the floor) plus every protocol
// that records no token and sits below the watchlist's TVL floor: the early
// ones the radar exists to find. Protocols above the floor that the
// watchlist leaves out are the giants that already trade in another form
// (centralised exchanges, wrapped and staked products of tokens that
// trade, bridges) and are not ranked as launches. Protocols whose token
// already trades are set aside in the dashboard's own list, never on the
// board: the board separates what trades from what is still to come.
//
// Every row carries a seven-step farm plan with concrete costs and times,
// written from the protocol's own category and chains.

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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  return Math.max(0, Math.floor((to - from) / 86_400_000));
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
  'BNB Chain': 'BNB',
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
};

function gasOf(chain: string): string {
  return GAS[chain] ?? "the chain's gas token";
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

/** Seven concrete farm steps for one protocol, each 20 to 600 characters. */
export function farmSteps(p: Protocol): string[] {
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

  // Category multiples from the protocols whose token already trades.
  const byCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      allRatios.push(ratio);
      if (p.category !== null) {
        const list = byCategory.get(p.category) ?? [];
        list.push(ratio);
        byCategory.set(p.category, list);
      }
    }
  }
  const globalMultiple = clamp(median(allRatios), MULTIPLE_MIN, MULTIPLE_MAX);
  const multiples: Record<string, number> = {};
  for (const [category, ratios] of byCategory) {
    if (ratios.length >= 3) multiples[category] = clamp(median(ratios), MULTIPLE_MIN, MULTIPLE_MAX);
  }
  const multipleFor = (category: string | null): number =>
    category !== null && multiples[category] !== undefined ? multiples[category]! : globalMultiple;

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

  const details: DetailRow[] = [];
  for (const p of chosen.values()) {
    const multiple = multipleFor(p.category);
    const growth = 1 + clamp(p.change_7d ?? 0, GROWTH_MIN, GROWTH_MAX) / 100;
    const ageYears = p.listed_at === null ? 0 : daysBetween(p.listed_at, snapshot.as_of) / 365.25;
    const maturity = 1 + MATURITY_PER_YEAR * Math.min(ageYears, MATURITY_CAP_YEARS);
    const implied = Math.max(1, Math.min(IMPLIED_CAP, Math.round(p.tvl_usd * multiple * growth * maturity)));
    details.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(p),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_years: Math.round(ageYears * 100) / 100,
      multiple: Math.round(multiple * 1000) / 1000,
      growth: Math.round(growth * 1000) / 1000,
      maturity: Math.round(maturity * 1000) / 1000,
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
  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model: {
      formula: 'implied = TVL x category multiple (median mcap/TVL of traded comps) x growth (1 + clamped 7d change) x maturity (1 + 0.1/year, capped at 3 years)',
      global_multiple: globalMultiple,
      multiples,
      board_size: details.length,
      watchlist_size: snapshot.watchlist.length,
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
