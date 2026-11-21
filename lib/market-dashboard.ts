/**
 * Numbers for the /mercado dashboard: the market by district, the price spread, and
 * what each portal contributes. The counting is pure; `loadMarketDashboard` only
 * fetches and memoizes.
 */

import type { ConstructionPipeline } from './analytics';
import { Operation, PostingKind } from './generated/prisma/enums';
import { grossYieldPct } from './gross-yield';
import { homeKpis, type HomeKpis } from './home';
import { median } from './linalg';
import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from './listing-card';
import { postingSource } from './official-price';
import { isLivePosting, livePostingWhere, type PossiblySoldCutoffs } from './possibly-sold';

const DAY_MS = 86_400_000;

/** Districts with fewer sales than this are too thin to be called the best yield. */
const MIN_SALES_FOR_TOP_YIELD = 20;

export type DistrictMarket = {
  slug: string;
  name: string;
  typicalSalePen: number | null;
  typicalRentPen: number | null;
  grossYieldPct: number | null;
  saleCount: number;
  rentCount: number;
};

export function districtMarket(
  sales: { districtSlug: string; districtName: string; pricePen: number; grossRentPen: number | null }[],
  rents: { districtSlug: string; pricePen: number }[],
): DistrictMarket[] {
  const rentsBySlug = new Map<string, number[]>();
  for (const r of rents) rentsBySlug.set(r.districtSlug, [...(rentsBySlug.get(r.districtSlug) ?? []), r.pricePen]);

  const salesBySlug = new Map<string, typeof sales>();
  for (const s of sales) salesBySlug.set(s.districtSlug, [...(salesBySlug.get(s.districtSlug) ?? []), s]);

  return [...salesBySlug.entries()]
    .map(([slug, group]) => {
      const districtRents = rentsBySlug.get(slug) ?? [];
      const yields = group.flatMap((s) => {
        const y = grossYieldPct(s.grossRentPen, s.pricePen);
        return y == null ? [] : [y];
      });
      return {
        slug,
        name: group[0].districtName,
        typicalSalePen: median(group.map((s) => s.pricePen)),
        typicalRentPen: districtRents.length ? median(districtRents) : null,
        grossYieldPct: yields.length ? Math.round(median(yields) * 10) / 10 : null,
        saleCount: group.length,
        rentCount: districtRents.length,
      };
    })
    .sort((a, b) => b.saleCount - a.saleCount);
}

/** The districts with the highest gross yield, among those with enough sales to trust it. */
export function topYieldSlugs(rows: DistrictMarket[], n = 3): string[] {
  return rows
    .filter((r): r is DistrictMarket & { grossYieldPct: number } => r.grossYieldPct != null && r.saleCount >= MIN_SALES_FOR_TOP_YIELD)
    .sort((a, b) => b.grossYieldPct - a.grossYieldPct)
    .slice(0, n)
    .map((r) => r.slug);
}

/** Bin edges in soles; the last bin has no upper edge. */
const HISTOGRAM_EDGES = Array.from({ length: 21 }, (_, i) => i * 100_000);

function formatMillions(pen: number, decimals = 1): string {
  return (pen / 1_000_000).toFixed(decimals).replace('.', ',');
}

function binLabel(from: number, to: number | null): string {
  if (to == null) return `S/ ${formatMillions(from, 0)} M o más`;
  if (to <= 1_000_000) return `S/ ${from / 1000}–${to / 1000} mil`;
  return `S/ ${formatMillions(from)}–${formatMillions(to)} M`;
}

export function priceHistogram(prices: number[]): { label: string; from: number; to: number | null; count: number }[] {
  const bins = HISTOGRAM_EDGES.map((from, i) => {
    const to = HISTOGRAM_EDGES[i + 1] ?? null;
    return { label: binLabel(from, to), from, to, count: 0 };
  });
  for (const price of prices) {
    const bin = [...bins].reverse().find((b) => price >= b.from);
    if (bin) bin.count += 1;
  }
  return bins;
}

export type SourceStats = {
  source: SourceId;
  label: string;
  liveCount: number;
  typicalSalePen: number | null;
  newLast7: number;
  goneLast7: number;
};

export type SourcePosting = {
  source: SourceId;
  districtSlug: string;
  operation: string;
  pricePen: number | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  removedAt: Date | null;
};

/**
 * When a posting left the market, or null while it is on it. A removed posting left
 * when it was removed; otherwise it left once its source's cutoff passed it, and
 * `lastSeenAt` is the date `loadPriceIndex` files that exit under.
 */
export function exitDate(
  posting: Pick<SourcePosting, 'source' | 'districtSlug' | 'operation' | 'lastSeenAt' | 'removedAt'>,
  cutoffs: PossiblySoldCutoffs,
): Date | null {
  if (posting.removedAt) return posting.removedAt;
  return isLivePosting(posting, cutoffs) ? null : posting.lastSeenAt;
}

/**
 * Per portal: live postings, their median price, those first seen in the last 7 days,
 * and those that left in the last 7 days. "Left" is a posting that is no longer live and
 * whose `exitDate` falls in (now - 7 days, now].
 */
export function sourceStats(postings: SourcePosting[], cutoffs: PossiblySoldCutoffs, now: Date): SourceStats[] {
  const since = now.getTime() - 7 * DAY_MS;
  return SOURCE_IDS.flatMap((source) => {
    const own = postings.filter((p) => p.source === source);
    const live = own.filter((p) => isLivePosting(p, cutoffs));
    const gone = own.filter((p) => {
      const left = exitDate(p, cutoffs)?.getTime();
      return left != null && left > since && left <= now.getTime();
    });
    if (!live.length && !gone.length) return [];
    const prices = live.flatMap((p) => (p.pricePen == null ? [] : [p.pricePen]));
    return [
      {
        source,
        label: SOURCE_LABELS[source],
        liveCount: live.length,
        typicalSalePen: prices.length ? median(prices) : null,
        newLast7: live.filter((p) => p.firstSeenAt.getTime() >= since).length,
        goneLast7: gone.length,
      },
    ];
  });
}

/** Properties with live copies on two or more portals. */
export function repeatedAcrossPortals(rows: { copies: { source: SourceId | null }[] }[]): number {
  return rows.filter((r) => new Set(r.copies.flatMap((c) => (c.source ? [c.source] : []))).size >= 2).length;
}

export type MarketDashboard = {
  kpis: HomeKpis & { projectCount: number };
  districts: DistrictMarket[];
  topYield: string[];
  histogram: ReturnType<typeof priceHistogram>;
  construction: ConstructionPipeline[];
  sources: SourceStats[];
  repeated: number;
};

async function loadSourcePostings(cutoffs: PossiblySoldCutoffs, now: Date): Promise<SourcePosting[]> {
  const { prisma } = await import('./db');
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const postings = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.SALE,
      currentSnapshot: { isNot: null },
      AND: [
        { OR: [livePostingWhere(cutoffs), { lastSeenAt: { gte: since } }, { removedAt: { gte: since } }] },
        { OR: [{ propertyId: null }, { property: { discarded: false } }] },
      ],
    },
    select: {
      source: true,
      districtSlug: true,
      operation: true,
      firstSeenAt: true,
      lastSeenAt: true,
      removedAt: true,
      currentSnapshot: { select: { pricePen: true } },
    },
  });
  return postings.flatMap((p) => {
    const source = postingSource(p.source);
    if (!source) return [];
    return [
      {
        source,
        districtSlug: p.districtSlug,
        operation: p.operation,
        pricePen: p.currentSnapshot?.pricePen == null ? null : Number(p.currentSnapshot.pricePen),
        firstSeenAt: p.firstSeenAt,
        lastSeenAt: p.lastSeenAt,
        removedAt: p.removedAt,
      },
    ];
  });
}

async function loadMarketDashboardUncached(): Promise<MarketDashboard> {
  // The database-bound modules load here so the counting above stays importable without a database.
  const [{ getCachedSaleListings }, { loadRentObservations, possiblySoldCutoffs }, { loadConstructionPipeline }, { loadProjectRows }] =
    await Promise.all([import('./listings'), import('./market'), import('./analytics'), import('./project-rows')]);
  const now = new Date();
  const [universe, rents, construction, projects, cutoffs] = await Promise.all([
    getCachedSaleListings(),
    loadRentObservations(),
    loadConstructionPipeline(),
    loadProjectRows(),
    possiblySoldCutoffs(),
  ]);
  const sales = universe.listings;
  const slugs = new Set(sales.map((r) => r.districtSlug));
  const districtRents = rents.filter((o) => slugs.has(o.districtSlug));
  const districts = districtMarket(sales, districtRents);
  return {
    kpis: { ...homeKpis(sales, districtRents.map((o) => o.pricePen)), projectCount: projects.length },
    districts,
    topYield: topYieldSlugs(districts),
    histogram: priceHistogram(sales.map((r) => r.pricePen)),
    construction,
    sources: sourceStats(await loadSourcePostings(cutoffs, now), cutoffs, now),
    repeated: repeatedAcrossPortals(sales),
  };
}

/** Same memo rules as the sale listings: keyed by scrape run, cleared by `invalidateSaleListings`. */
const MEMO_TTL_MS = 3600 * 1000;
const SHAPE_VERSION = 'market-v1';
const memoHolder = globalThis as unknown as {
  __marketDashboardMemo?: { key: string; at: number; value: Promise<MarketDashboard> };
};

export async function loadMarketDashboard(): Promise<MarketDashboard> {
  const { latestScrapeCacheKey } = await import('./listings');
  const key = `${SHAPE_VERSION}:${await latestScrapeCacheKey()}`;
  const memo = memoHolder.__marketDashboardMemo;
  if (memo && memo.key === key && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;

  const value = loadMarketDashboardUncached();
  const entry = { key, at: Date.now(), value };
  memoHolder.__marketDashboardMemo = entry;
  value.catch(() => {
    if (memoHolder.__marketDashboardMemo === entry) memoHolder.__marketDashboardMemo = undefined;
  });
  return value;
}
