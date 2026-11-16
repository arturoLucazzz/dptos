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
import { Operation, PostingKind, ScrapeStatus } from './generated/prisma/enums';
import type { ListingRow } from './listing-row';
import { getFairPriceModel, getRentIndex, possiblySoldCutoffs } from './market';
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

/**
 * Live sale units for the departamentos table.
 *
 * Projects are excluded: their price is a "desde" and every coverage number built
 * on it would be fiction. Discarded properties stay out of the default view; the
 * discard reason is what teaches the model which variable it is missing.
 */
export async function loadSaleListings(): Promise<ListingsPage> {
  const [cutoffs, fixedAssumptions, fairPriceModel, rentIndex, latestRun] = await Promise.all([
    possiblySoldCutoffs(),
    getFixedAssumptions(),
    getFairPriceModel(),
    getRentIndex(),
    prisma.scrapeRun.findFirst({
      where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
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

  // Possibly sold (or removed) in the last 90 days, for inventory months. Counted per district
  // so a quiet district does not inherit Miraflores' turnover.
  const soldSince = new Date(asOfTime(latestRun) - 90 * 86_400_000);
  const recentlyGone = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.SALE,
      lastSeenAt: { gte: soldSince },
      AND: [notLivePostingWhere(cutoffs)],
    },
    select: { districtSlug: true },
  });
  const soldByDistrict = new Map<string, number>();
  for (const row of recentlyGone) {
    soldByDistrict.set(row.districtSlug, (soldByDistrict.get(row.districtSlug) ?? 0) + 1);
  }

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

  // Live listing counts per property and per district, before quality filtering, so
  // a multi-listed apartment still counts as multi-listed even if one of the
  // copies is flagged.
  const liveByProperty = new Map<string, number>();
  const liveByDistrict = new Map<string, number>();
  for (const posting of postings) {
    liveByDistrict.set(posting.districtSlug, (liveByDistrict.get(posting.districtSlug) ?? 0) + 1);
    if (posting.propertyId) {
      liveByProperty.set(posting.propertyId, (liveByProperty.get(posting.propertyId) ?? 0) + 1);
    }
  }

  const inventoryByDistrict = new Map<string, number | null>();
  for (const [slug, liveCount] of liveByDistrict) {
    inventoryByDistrict.set(
      slug,
      inventoryMonths({ liveCount, soldLast90Days: soldByDistrict.get(slug) ?? 0 })
    );
  }

  type Draft = ListingRow & { _pricePen: number; _areaM2: number | null };
  const drafts: Draft[] = [];

  for (const posting of postings) {
    const snapshot = posting.currentSnapshot;
    if (!snapshot || snapshot.pricePen == null) continue;
    if (!isUsableComparable(snapshot.qualityFlags)) continue;

    const areaRaw = snapshot.areaTotal ?? snapshot.areaCovered;
    const areaM2 = areaRaw == null ? null : Number(areaRaw);
    const pricePen = Number(snapshot.pricePen);
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
    const listingCount = posting.propertyId ? (liveByProperty.get(posting.propertyId) ?? 1) : 1;
    const invMonths = inventoryByDistrict.get(posting.districtSlug) ?? null;
    const days = daysOnMarket(publishedAt, asOf);
    const cut = priceCutScore({
      daysPublished: days,
      priceCutCount,
      totalCutPct: cutPct,
      listingCount,
      inventoryMonths: invMonths,
    });

    drafts.push({
      postingId: posting.id,
      propertyId: posting.propertyId,
      sourcePostingId: posting.sourcePostingId,
      sourcePath: posting.sourcePath,
      districtSlug: posting.districtSlug,
      districtName: titleCaseDistrict(posting.districtSlug),
      operation: 'SALE',
      pricePen,
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
      _pricePen: pricePen,
      _areaM2: areaM2,
    });
  }

  // Relative outlier flag needs the whole district, so it runs after the loop.
  const outliers = pricePerM2OutlierMask(
    drafts.map((d) => ({
      districtSlug: d.districtSlug,
      pricePen: d._pricePen,
      areaM2: d._areaM2,
    }))
  );

  const listings: ListingRow[] = drafts
    .filter((_, i) => !outliers[i])
    .map(({ _pricePen: _, _areaM2: __, ...row }) => row);

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
  ['sale-listings'],
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
