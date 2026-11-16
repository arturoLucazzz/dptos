/**
 * Loading the thin listing projection for the app.
 *
 * Filters that discard data (implausible prices, outliers) happen here via
 * `qualityFlags` and `isUsableComparable`, never by deleting rows. Deleting is what
 * made the old JSON pipeline count a S/ 1 listing as a sale the next run.
 */

import { unstable_cache } from 'next/cache';
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
import { isUsableComparable, pricePerM2OutlierMask } from './quality-flags';
import { inventoryMonths, priceCutScore, totalCutFromPeak } from './price-cut';
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

    const rent =
      areaM2 != null
        ? estimateGrossRent(rentIndex, {
            districtSlug: posting.districtSlug,
            areaM2,
            bedrooms: snapshot.bedrooms,
          })
        : null;

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
    const listingCount = group.copies.length;
    const invMonths = inventoryByDistrict.get(posting.districtSlug) ?? null;
    const days = daysOnMarket(publishedAt, asOf);
    const cut = priceCutScore({
      daysPublished: days,
      priceCutCount,
      totalCutPct: cutPct,
      listingCount,
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
      grossRentPen: rent?.grossRentPen ?? null,
      rentSampleN: rent?.n ?? null,
      rentConfidence: rent?.confidence ?? null,
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

async function latestScrapeCacheKey(): Promise<string> {
  const run = await prisma.scrapeRun.findFirst({
    where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, finishedAt: true, startedAt: true },
  });
  if (!run) return 'none';
  return `${run.id}:${(run.finishedAt ?? run.startedAt).toISOString()}`;
}

const loadSaleListingsCached = unstable_cache(
  async (_scrapeKey: string) => loadSaleListings(),
  // The version part changes when the row shape does, so an entry cached by an
  // older build is not served with fields missing.
  ['sale-listings', 'rows-v3-copy-posting-ids'],
  { revalidate: 3600, tags: ['sale-listings'] }
);

/**
 * Enriched sale universe cached per scrape run so filter/finance requests do not
 * re-fit fair-price and rent models on every keystroke.
 */
export async function getCachedSaleListings(): Promise<ListingsPage> {
  const scrapeKey = await latestScrapeCacheKey();
  return loadSaleListingsCached(scrapeKey);
}
