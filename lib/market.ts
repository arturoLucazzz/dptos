/**
 * Loading the market from the database and keeping a fitted model in memory.
 *
 * The fair-price model is deliberately not a stored column. Fitting it is a pass
 * over the live listings plus a small matrix solve, so it is cheap enough to do on
 * demand, and doing it on demand means the model can change without a migration and
 * without old derived values silently disagreeing with the new ones.
 *
 * What makes that affordable is the cache key: the most recent scrape run. Prices
 * only change when a run observes them changing, so a model fitted after the last
 * run stays correct until the next one finishes.
 */

import { prisma } from './db';
import { Operation, PostingKind, ScrapeStatus } from './generated/prisma/enums';
import { fitFairPrice, type Comparable, type FairPriceModel } from './fair-price';
import { isUsableComparable, pricePerM2OutlierMask } from './quality-flags';
import { buildRentIndex, type RentIndex, type RentObservation } from './rent';
import { cutoffsFromRuns, livePostingWhere, type PossiblySoldCutoffs } from './possibly-sold';
import { collapseCopies, postingSource } from './official-price';

/**
 * Each slice's possibly-sold cutoff (source, district, operation), from the run
 * history.
 *
 * A slice with too little history has no cutoff, which means nothing in it can
 * be called sold, which is the correct answer on day one.
 */
export async function possiblySoldCutoffs(): Promise<PossiblySoldCutoffs> {
  const runs = await prisma.scrapeRun.findMany({
    where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
    select: { startedAt: true, sources: true, districtCounts: true },
  });
  return cutoffsFromRuns(runs);
}

/**
 * A listing is brand new if it says so, not if it is merely recent.
 *
 * This is only about condition, for the regression's "a estrenar" premium. It is
 * *not* the test for the alcabala exemption, which requires the sale to be the
 * first one from the developer — a stronger claim that this does not establish.
 */
function isBrandNew(snapshot: { antiquityYears: number | null; developmentStage: string | null }): boolean {
  if (snapshot.developmentStage) return true;
  return snapshot.antiquityYears != null && snapshot.antiquityYears <= 1;
}

interface PostingIdentity {
  postingId: string;
  propertyId: string | null;
  source: string;
}

/**
 * One row per property, at its official (lowest) price.
 *
 * Copies of one apartment on several sources are one apartment: counting each
 * would weigh it two or three times in a coefficient or a district median.
 */
function onePerProperty<T extends PostingIdentity & { pricePen: number }>(rows: T[]): T[] {
  const official = collapseCopies(
    rows.map((row) => ({
      postingId: row.postingId,
      propertyId: row.propertyId,
      source: postingSource(row.source),
      url: null,
      pricePen: row.pricePen,
    }))
  );
  return rows.filter((row) => official.has(row.postingId));
}

/**
 * The listings the fair-price model is allowed to learn from.
 *
 * Three exclusions, each for a different reason:
 *
 * - Projects, because their price is a "desde" for the cheapest unit in the
 *   building, so fitting on them teaches the model that new buildings are cheap.
 * - Listings with disqualifying quality flags, because a rent filed as a sale is
 *   the kind of row that moves a coefficient on its own.
 * - Listings possibly already sold, because the model should describe what can be
 *   bought today.
 *
 * Plus one exclusion that needs the whole set to decide: prices absurd for their
 * own district per m². A real Lince listing asks S/ 55,275,000 for 60 m², and no
 * per-listing rule catches it.
 *
 * Then each property counts once, at its official price.
 */
export async function loadSaleComparables(): Promise<Comparable[]> {
  const cutoffs = await possiblySoldCutoffs();

  const postings = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.SALE,
      AND: [livePostingWhere(cutoffs)],
      currentSnapshot: { isNot: null },
    },
    select: {
      id: true,
      propertyId: true,
      source: true,
      districtSlug: true,
      currentSnapshot: {
        select: {
          pricePen: true,
          areaTotal: true,
          areaCovered: true,
          bedrooms: true,
          bathrooms: true,
          parkingSpots: true,
          antiquityYears: true,
          developmentStage: true,
          qualityFlags: true,
        },
      },
    },
  });

  const comparables: (Comparable & PostingIdentity)[] = [];
  for (const posting of postings) {
    const snapshot = posting.currentSnapshot;
    if (!snapshot) continue;
    if (!isUsableComparable(snapshot.qualityFlags)) continue;

    const areaRaw = snapshot.areaTotal ?? snapshot.areaCovered;
    if (snapshot.pricePen == null || areaRaw == null) continue;

    comparables.push({
      postingId: posting.id,
      propertyId: posting.propertyId,
      source: posting.source,
      districtSlug: posting.districtSlug,
      pricePen: Number(snapshot.pricePen),
      areaM2: Number(areaRaw),
      bedrooms: snapshot.bedrooms,
      bathrooms: snapshot.bathrooms,
      parkingSpots: snapshot.parkingSpots,
      antiquityYears: snapshot.antiquityYears,
      isNew: isBrandNew(snapshot),
    });
  }

  const outliers = pricePerM2OutlierMask(comparables);
  return onePerProperty(comparables.filter((_, i) => !outliers[i]));
}

/**
 * Rental listings, for the rent index.
 *
 * The quality gate matters more here than for sales: a sale price filed as a rent is
 * six thousand soles a month of pure fiction, and it would move a district median
 * enough to change every coverage number in it.
 *
 * Each property counts once, at its lowest live rent: an Adondevivir copy of an
 * Urbania ad is the same flat, not a second data point.
 */
export async function loadRentObservations(): Promise<RentObservation[]> {
  const cutoffs = await possiblySoldCutoffs();

  const postings = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.RENT,
      AND: [livePostingWhere(cutoffs)],
      currentSnapshot: { isNot: null },
    },
    select: {
      id: true,
      propertyId: true,
      source: true,
      districtSlug: true,
      currentSnapshot: {
        select: {
          pricePen: true,
          areaTotal: true,
          areaCovered: true,
          bedrooms: true,
          qualityFlags: true,
        },
      },
    },
  });

  const rows: (RentObservation & PostingIdentity)[] = [];
  for (const posting of postings) {
    const snapshot = posting.currentSnapshot;
    if (!snapshot || !isUsableComparable(snapshot.qualityFlags)) continue;
    const area = snapshot.areaTotal ?? snapshot.areaCovered;
    if (snapshot.pricePen == null || area == null) continue;

    rows.push({
      postingId: posting.id,
      propertyId: posting.propertyId,
      source: posting.source,
      districtSlug: posting.districtSlug,
      pricePen: Number(snapshot.pricePen),
      areaM2: Number(area),
      bedrooms: snapshot.bedrooms,
    });
  }

  const outliers = pricePerM2OutlierMask(rows);
  return onePerProperty(rows.filter((_, i) => !outliers[i]));
}

/** Identity of the current data: a new finished run means new models. */
async function currentDataKey(): Promise<string> {
  const latest = await prisma.scrapeRun.findFirst({
    where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, finishedAt: true },
  });
  return latest ? `${latest.id}:${latest.finishedAt?.getTime() ?? 'running'}` : 'empty';
}

/**
 * Cache of the promise, not of the value.
 *
 * Two requests arriving together on a cold cache would otherwise both do the same
 * work, which is exactly what happens when a page loads several components that all
 * need the model.
 */
const caches = new Map<string, { key: string; value: Promise<unknown> }>();

async function memoByRun<T>(name: string, build: () => Promise<T>): Promise<T> {
  const key = await currentDataKey();
  const existing = caches.get(name);
  if (existing?.key === key) return existing.value as Promise<T>;

  const value = build();
  caches.set(name, { key, value });
  // A rejected promise must not be cached as if it were an answer.
  value.catch(() => {
    if (caches.get(name)?.value === value) caches.delete(name);
  });
  return value;
}

/**
 * The fitted fair-price model for the current data, from cache when possible.
 *
 * Null means the market is too small to model, and callers are expected to fall back
 * to district medians rather than to a made-up number.
 */
export function getFairPriceModel(): Promise<FairPriceModel | null> {
  return memoByRun('fairPrice', () => loadSaleComparables().then(fitFairPrice));
}

/** The district × bedrooms rent index for the current data. */
export function getRentIndex(): Promise<RentIndex> {
  return memoByRun('rentIndex', () => loadRentObservations().then(buildRentIndex));
}

/** For tests and for the scraper, which changes the data under a warm cache. */
export function invalidateMarketCache(): void {
  caches.clear();
}
