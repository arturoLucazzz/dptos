/**
 * Loading the thin listing projection for the app.
 *
 * Filters that discard data (implausible prices, outliers) happen here via
 * `qualityFlags` and `isUsableComparable`, never by deleting rows. Deleting is what
 * made the old JSON pipeline count a S/ 1 listing as a sale the next run.
 */

import { getFixedAssumptions } from './assumptions';
import { prisma } from './db';
import type { Prisma } from './generated/prisma/client';
import { DuplicateLevel, DuplicateStatus, Operation, PostingKind, ScrapeStatus } from './generated/prisma/enums';
import type { DuplicateFlag, ListingRow } from './listing-row';
import { collapseCopies, postingSource, postingUrl } from './official-price';
import { getFairPriceModel, getRentIndex, possiblySoldCutoffs } from './market';
import { countGoneProperties, countProperties } from './property-stats';
import { livePostingWhere, notLivePostingWhere } from './possibly-sold';
import { daysOnMarket, fitIdToDate, publishedAtFor, type IdDateAnchor } from './posting-age';
import { estimateGrossRent } from './rent';
import { rentForRow } from './location/row-rent';
import type { LocationReason } from './location/score';
import { isUsableComparable, pricePerM2OutlierMask } from './quality-flags';
import { distinctPublisherCount, inventoryMonths, priceCutScore, totalCutFromPeak } from './price-cut';
import type { FixedAssumptions } from './assumption-defaults';

function titleCaseDistrict(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function asOfTime(run: { finishedAt: Date | null; startedAt: Date } | null): number {
  return (run?.finishedAt ?? run?.startedAt ?? new Date()).getTime();
}

export interface ListingsPage {
  listings: ListingRow[];
  scrapedAt: string | null;
  fixedAssumptions: FixedAssumptions;
  districtOptions: { value: string; label: string }[];
}

/** Runs that are more than one `/agregar` entry, which records only `manual`. */
const NOT_A_MANUAL_ENTRY = { NOT: { sources: { equals: ['manual'] } } } satisfies Prisma.ScrapeRunWhereInput;

/**
 * Live sale units for the departamentos table.
 *
 * Projects are excluded: their price is a "desde" and every coverage number built
 * on it would be fiction. Discarded properties stay out of the default view; the
 * discard reason is what teaches the model which variable it is missing.
 *
 * One row per property: the copy with the lowest live price is the official row,
 * and every per-row number (fair price gap, rent, coverage downstream) is computed
 * on that price. The other copies ride along in `copies`.
 */
export async function loadSaleListings(): Promise<ListingsPage> {
  const [cutoffs, fixedAssumptions, fairPriceModel, rentIndex, latestRun] = await Promise.all([
    possiblySoldCutoffs(),
    getFixedAssumptions(),
    getFairPriceModel(),
    getRentIndex(),
    prisma.scrapeRun.findFirst({
      // A hand-typed listing is not a scrape: it must not make the data look fresh.
      where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] }, ...NOT_A_MANUAL_ENTRY },
      orderBy: { startedAt: 'desc' },
      select: { finishedAt: true, startedAt: true },
    }),
  ]);

  const postings = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.SALE,
      AND: [livePostingWhere(cutoffs)],
      currentSnapshot: { isNot: null },
      OR: [{ propertyId: null }, { property: { discarded: false } }],
    },
    select: {
      id: true,
      source: true,
      sourcePostingId: true,
      sourcePath: true,
      districtSlug: true,
      operation: true,
      propertyId: true,
      firstSeenAt: true,
      lastSeenAt: true,
      property: { select: { favorite: true, discarded: true } },
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
          maintenanceAmount: true,
          qualityFlags: true,
          address: true,
          title: true,
          imageUrl: true,
          sourceUrl: true,
          firstDateOnline: true,
          publisherId: true,
          publisherName: true,
        },
      },
      // Chronological prices for cut count and peak. Cheap because snapshots are
      // only written when something changes.
      snapshots: {
        orderBy: { observedAt: 'asc' },
        select: { pricePen: true },
      },
    },
  });

  // Properties gone in the last 90 days, for inventory months. Counted per district
  // so a quiet district does not inherit Miraflores' turnover. A property is gone
  // only when every copy is: one still live on another source is on the market.
  const soldSince = new Date(asOfTime(latestRun) - 90 * 86_400_000);
  const recentlyGone = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.SALE,
      lastSeenAt: { gte: soldSince },
      AND: [notLivePostingWhere(cutoffs)],
    },
    select: { id: true, propertyId: true, districtSlug: true },
  });
  const goneIds = [...new Set(recentlyGone.flatMap((r) => (r.propertyId ? [r.propertyId] : [])))];
  const stillLive = goneIds.length
    ? await prisma.posting.findMany({
        where: {
          kind: PostingKind.UNIT,
          operation: Operation.SALE,
          propertyId: { in: goneIds },
          AND: [livePostingWhere(cutoffs)],
        },
        select: { propertyId: true },
      })
    : [];
  const soldByDistrict = countGoneProperties(
    recentlyGone.map((r) => ({ postingId: r.id, propertyId: r.propertyId, districtSlug: r.districtSlug })),
    new Set(stillLive.flatMap((r) => (r.propertyId ? [r.propertyId] : [])))
  );

  // Age model from the listings that report a date. One district alone rarely has
  // enough anchors; pooling every live listing is what makes day-one ages usable.
  const anchors: IdDateAnchor[] = [];
  for (const posting of postings) {
    const date = posting.currentSnapshot?.firstDateOnline;
    if (!date) continue;
    const id = Number(posting.sourcePostingId);
    if (Number.isFinite(id)) anchors.push({ id, publishedAt: date });
  }
  const ageModel = fitIdToDate(anchors);
  const asOf = asOfTime(latestRun) ? new Date(asOfTime(latestRun)) : new Date();

  // Live property count per district, like the "gone" side above, so the ratio
  // compares like with like.
  const liveByDistrict = countProperties(
    postings.map((p) => ({ postingId: p.id, propertyId: p.propertyId, districtSlug: p.districtSlug }))
  );

  const inventoryByDistrict = new Map<string, number | null>();
  for (const [slug, liveCount] of liveByDistrict) {
    inventoryByDistrict.set(
      slug,
      inventoryMonths({ liveCount, soldLast90Days: soldByDistrict.get(slug) ?? 0 })
    );
  }

  // Copies that can carry a price: usable, priced, and not an outlier for their
  // district. A flagged copy must not become the official price, so these filters
  // run before choosing it.
  const priced = postings.flatMap((posting) => {
    const snapshot = posting.currentSnapshot;
    if (!snapshot || snapshot.pricePen == null) return [];
    if (!isUsableComparable(snapshot.qualityFlags)) return [];
    const areaRaw = snapshot.areaTotal ?? snapshot.areaCovered;
    return [
      {
        posting,
        snapshot,
        pricePen: Number(snapshot.pricePen),
        areaM2: areaRaw == null ? null : Number(areaRaw),
      },
    ];
  });
  const outliers = pricePerM2OutlierMask(
    priced.map((p) => ({
      districtSlug: p.posting.districtSlug,
      pricePen: p.pricePen,
      areaM2: p.areaM2,
    }))
  );
  const candidates = priced.filter((_, i) => !outliers[i]);

  const official = collapseCopies(
    candidates.map(({ posting, snapshot, pricePen }) => {
      const source = postingSource(posting.source);
      return {
        postingId: posting.id,
        propertyId: posting.propertyId,
        source,
        url: postingUrl(source, posting.sourcePath, snapshot.sourceUrl),
        pricePen,
      };
    })
  );

  const propertyIds = new Set<string>();
  for (const { posting } of candidates) {
    if (posting.propertyId && official.has(posting.id)) propertyIds.add(posting.propertyId);
  }
  const duplicateFlags = await loadDuplicateFlags([...propertyIds]);
  const locations = await loadLocations([...propertyIds]);

  const snapshotByPosting = new Map(candidates.map(({ posting, snapshot }) => [posting.id, snapshot]));
  const listings: ListingRow[] = [];

  for (const { posting, snapshot, pricePen, areaM2 } of candidates) {
    const group = official.get(posting.id);
    if (!group) continue;

    const source = postingSource(posting.source);
    const isNew =
      !!snapshot.developmentStage ||
      (snapshot.antiquityYears != null && snapshot.antiquityYears <= 1);
    const isFirstSaleFromDeveloper = snapshot.antiquityYears === 0;

    const fair =
      fairPriceModel && areaM2 != null && areaM2 > 0
        ? fairPriceModel.predict(
            {
              districtSlug: posting.districtSlug,
              areaM2,
              bedrooms: snapshot.bedrooms,
              bathrooms: snapshot.bathrooms,
              parkingSpots: snapshot.parkingSpots,
              antiquityYears: snapshot.antiquityYears,
              isNew,
            },
            pricePen
          )
        : null;

    const districtRent =
      areaM2 != null
        ? estimateGrossRent(rentIndex, {
            districtSlug: posting.districtSlug,
            areaM2,
            bedrooms: snapshot.bedrooms,
          })
        : null;
    const location = posting.propertyId ? locations.get(posting.propertyId) : undefined;
    // Every money number reads grossRentPen, so the local rent reaches them all here.
    const rent = rentForRow({ areaM2, local: location?.localRent ?? null, district: districtRent });

    const { publishedAt, estimated } = publishedAtFor({
      firstDateOnline: snapshot.firstDateOnline,
      sourcePostingId: posting.sourcePostingId,
      firstSeenAt: posting.firstSeenAt,
      model: ageModel,
    });

    const prices = posting.snapshots
      .map((s) => (s.pricePen == null ? null : Number(s.pricePen)))
      .filter((p): p is number => p != null && p > 0);
    let priceCutCount = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] < prices[i - 1]) priceCutCount++;
    }
    const peakPen = prices.length ? Math.max(...prices) : pricePen;
    const cutPct = totalCutFromPeak(peakPen, pricePen);
    // Shown as the number of ads; the cut score counts publishers instead, so
    // one broker's ad on both Navent portals is not "multi-listed".
    const listingCount = group.copies.length;
    const publisherCount = distinctPublisherCount(
      group.copies.map((copy) => {
        const copySnapshot = snapshotByPosting.get(copy.postingId);
        return {
          postingId: copy.postingId,
          source: copy.source,
          publisherId: copySnapshot?.publisherId ?? null,
          publisherName: copySnapshot?.publisherName ?? null,
        };
      })
    );
    const invMonths = inventoryByDistrict.get(posting.districtSlug) ?? null;
    const days = daysOnMarket(publishedAt, asOf);
    const cut = priceCutScore({
      daysPublished: days,
      priceCutCount,
      totalCutPct: cutPct,
      publisherCount,
      inventoryMonths: invMonths,
    });

    listings.push({
      postingId: posting.id,
      propertyId: posting.propertyId,
      sourcePostingId: posting.sourcePostingId,
      source,
      sourcePath: posting.sourcePath,
      url: postingUrl(source, posting.sourcePath, snapshot.sourceUrl),
      districtSlug: posting.districtSlug,
      districtName: titleCaseDistrict(posting.districtSlug),
      operation: 'SALE',
      pricePen,
      priceMaxPen: group.priceMaxPen,
      copies: group.copies,
      duplicateFlags: (posting.propertyId && duplicateFlags.get(posting.propertyId)) || [],
      areaM2,
      bedrooms: snapshot.bedrooms,
      bathrooms: snapshot.bathrooms,
      parkingSpots: snapshot.parkingSpots,
      antiquityYears: snapshot.antiquityYears,
      isNew,
      isFirstSaleFromDeveloper,
      maintenancePen:
        snapshot.maintenanceAmount == null ? null : Number(snapshot.maintenanceAmount),
      ...rent,
      locationStatus: location?.status ?? null,
      locationScore: location?.score ?? null,
      locationLivability: location?.livability ?? null,
      locationDemand: location?.demand ?? null,
      locationReasons: location?.reasons ?? [],
      discountPct: fair?.discountPct ?? null,
      fairPricePen: fair?.expectedPen ?? null,
      fairPriceConfidence: fair?.confidence ?? null,
      daysPublished: days,
      daysPublishedEstimated: estimated,
      listingCount,
      priceCutCount,
      totalCutPct: cutPct,
      inventoryMonths: invMonths,
      priceCutScore: cut.score,
      qualityFlags: snapshot.qualityFlags,
      address: snapshot.address,
      title: snapshot.title,
      imageUrl: snapshot.imageUrl,
      favorite: posting.property?.favorite ?? false,
      discarded: posting.property?.discarded ?? false,
    });
  }

  const districtOptions = Array.from(
    new Map(listings.map((l) => [l.districtSlug, { value: l.districtSlug, label: l.districtName }])).values()
  ).sort((a, b) => a.label.localeCompare(b.label, 'es'));

  return {
    listings,
    scrapedAt: (latestRun?.finishedAt ?? latestRun?.startedAt)?.toISOString() ?? null,
    fixedAssumptions,
    districtOptions,
  };
}

/**
 * Open MEDIUM and LOW duplicate candidates, per property, seen from that property.
 *
 * HIGH matches are merged by the matcher and never get a candidate row.
 */
async function loadDuplicateFlags(propertyIds: string[]): Promise<Map<string, DuplicateFlag[]>> {
  const flags = new Map<string, DuplicateFlag[]>();
  if (propertyIds.length === 0) return flags;

  const candidates = await prisma.duplicateCandidate.findMany({
    where: {
      status: DuplicateStatus.OPEN,
      level: { in: [DuplicateLevel.MEDIUM, DuplicateLevel.LOW] },
      OR: [{ propertyAId: { in: propertyIds } }, { propertyBId: { in: propertyIds } }],
    },
    select: { id: true, propertyAId: true, propertyBId: true, level: true },
    orderBy: { id: 'asc' },
  });

  const wanted = new Set(propertyIds);
  const add = (propertyId: string, flag: DuplicateFlag) => {
    if (!wanted.has(propertyId)) return;
    const list = flags.get(propertyId);
    if (list) list.push(flag);
    else flags.set(propertyId, [flag]);
  };
  for (const c of candidates) {
    const level = c.level === DuplicateLevel.MEDIUM ? 'MEDIUM' : 'LOW';
    add(c.propertyAId, { candidateId: c.id, level, otherPropertyId: c.propertyBId });
    add(c.propertyBId, { candidateId: c.id, level, otherPropertyId: c.propertyAId });
  }
  return flags;
}

interface StoredLocation {
  status: 'OK' | 'OUTSIDE_LIMA' | 'NO_COORDINATES';
  score: number | null;
  livability: number | null;
  demand: number | null;
  reasons: LocationReason[];
  localRent: { perM2: number; highPerM2: number; n: number; maxDistanceM: number } | null;
}

/** The stored location rows for these properties, in one query. */
async function loadLocations(propertyIds: string[]): Promise<Map<string, StoredLocation>> {
  if (propertyIds.length === 0) return new Map();
  const rows = await prisma.propertyLocation.findMany({ where: { propertyId: { in: propertyIds } } });
  const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
  return new Map(
    rows.map((r) => [
      r.propertyId,
      {
        status: r.status,
        score: num(r.score),
        livability: num(r.livability),
        demand: num(r.demand),
        reasons: Array.isArray(r.reasons) ? (r.reasons as unknown as LocationReason[]) : [],
        localRent:
          r.localRentPerM2 != null && r.localRentHighPerM2 != null && r.localRentN != null && r.localRentMaxDistanceM != null
            ? { perM2: Number(r.localRentPerM2), highPerM2: Number(r.localRentHighPerM2), n: r.localRentN, maxDistanceM: r.localRentMaxDistanceM }
            : null,
      },
    ])
  );
}

async function latestScrapeCacheKey(): Promise<string> {
  const run = await prisma.scrapeRun.findFirst({
    where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, finishedAt: true, startedAt: true },
  });
  // The location refresh runs after the scrape finishes, so its time is part of the key.
  const location = await prisma.propertyLocation.findFirst({ orderBy: { computedAt: 'desc' }, select: { computedAt: true } });
  const locationKey = location?.computedAt.toISOString() ?? 'no-location';
  if (!run) return `none:${locationKey}`;
  return `${run.id}:${(run.finishedAt ?? run.startedAt).toISOString()}:${locationKey}`;
}

/**
 * In-process memo, not `unstable_cache`: the enriched universe is several MB and the
 * Next.js data cache refuses items over 2 MB (it logged an unhandled rejection and
 * recomputed on every request). Kept on globalThis so server actions and pages share it.
 */
const MEMO_TTL_MS = 3600 * 1000;
const memoHolder = globalThis as unknown as {
  __saleListingsMemo?: { key: string; at: number; value: Promise<ListingsPage> };
};

/** Drop the memo; call it wherever a write changes what the rows show. */
export function invalidateSaleListings(): void {
  memoHolder.__saleListingsMemo = undefined;
}

/**
 * Enriched sale universe cached per scrape run so filter/finance requests do not
 * re-fit fair-price and rent models on every keystroke.
 */
export async function getCachedSaleListings(): Promise<ListingsPage> {
  const key = await latestScrapeCacheKey();
  const memo = memoHolder.__saleListingsMemo;
  if (memo && memo.key === key && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;

  const value = loadSaleListings();
  const entry = { key, at: Date.now(), value };
  memoHolder.__saleListingsMemo = entry;
  // A failed load must not be remembered as an answer.
  value.catch(() => {
    if (memoHolder.__saleListingsMemo === entry) memoHolder.__saleListingsMemo = undefined;
  });
  return value;
}
