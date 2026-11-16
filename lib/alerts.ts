/**
 * What changed since yesterday — the reason the scraper runs every night.
 *
 * Without this the app is a museum: interesting numbers, no urgency. Two kinds of
 * alert matter within 24h:
 *
 * 1. A listing cut its price. That is a seller moving, and the cut size is the signal.
 * 2. Something new appeared with coverage in the top of the market. That is a
 *    candidate worth looking at before someone else does.
 *
 * Coverage for (2) is computed with the default assumptions, not the panel, so the
 * alert is stable overnight and not rewritten when you drag a slider.
 */

import { prisma } from './db';
import { Operation, PostingKind } from './generated/prisma/enums';
import { DEFAULT_PANEL, type FixedAssumptions } from './assumption-defaults';
import { getFixedAssumptions } from './assumptions';
import { financeForListing } from './listing-finance';
import type { ListingRow } from './listing-row';
import { loadSaleListings } from './listings';
import { possiblySoldCutoffs } from './market';
import { livePostingWhere } from './possibly-sold';

const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Coverage percentile that counts as "top of the market" for a new listing. */
const TOP_COVERAGE_PERCENTILE = 0.95;

export interface PriceDropAlert {
  kind: 'PRICE_DROP';
  postingId: string;
  propertyId: string | null;
  sourcePostingId: string;
  sourcePath: string | null;
  districtSlug: string;
  districtName: string;
  address: string | null;
  title: string | null;
  previousPen: number;
  currentPen: number;
  dropPct: number;
  observedAt: string;
}

export interface NewCoverageAlert {
  kind: 'NEW_HIGH_COVERAGE';
  postingId: string;
  propertyId: string | null;
  sourcePostingId: string;
  sourcePath: string | null;
  districtSlug: string;
  districtName: string;
  address: string | null;
  title: string | null;
  pricePen: number;
  coveragePct: number;
  discountPct: number | null;
  firstSeenAt: string;
}

export type Alert = PriceDropAlert | NewCoverageAlert;

function titleCaseDistrict(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Listings whose asking price fell in the alert window.
 *
 * Compared against the previous snapshot of the same posting, not against the
 * fair-price model — a cut is a cut even if the apartment was already cheap.
 */
export async function loadPriceDropAlerts(since: Date): Promise<PriceDropAlert[]> {
  const snapshots = await prisma.postingSnapshot.findMany({
    where: {
      observedAt: { gte: since },
      posting: { kind: PostingKind.UNIT, operation: Operation.SALE },
    },
    orderBy: { observedAt: 'desc' },
    select: {
      observedAt: true,
      pricePen: true,
      address: true,
      title: true,
      posting: {
        select: {
          id: true,
          propertyId: true,
          sourcePostingId: true,
          sourcePath: true,
          districtSlug: true,
          snapshots: {
            orderBy: { observedAt: 'desc' },
            take: 2,
            select: { pricePen: true, observedAt: true },
          },
        },
      },
    },
  });

  const seen = new Set<string>();
  const alerts: PriceDropAlert[] = [];

  for (const snap of snapshots) {
    if (seen.has(snap.posting.id)) continue;
    const trail = snap.posting.snapshots;
    if (trail.length < 2) continue;
    const current = trail[0].pricePen == null ? null : Number(trail[0].pricePen);
    const previous = trail[1].pricePen == null ? null : Number(trail[1].pricePen);
    if (current == null || previous == null || previous <= 0) continue;
    if (current >= previous) continue;

    seen.add(snap.posting.id);
    alerts.push({
      kind: 'PRICE_DROP',
      postingId: snap.posting.id,
      propertyId: snap.posting.propertyId,
      sourcePostingId: snap.posting.sourcePostingId,
      sourcePath: snap.posting.sourcePath,
      districtSlug: snap.posting.districtSlug,
      districtName: titleCaseDistrict(snap.posting.districtSlug),
      address: snap.address,
      title: snap.title,
      previousPen: previous,
      currentPen: current,
      dropPct: ((previous - current) / previous) * 100,
      observedAt: snap.observedAt.toISOString(),
    });
  }

  return alerts.sort((a, b) => b.dropPct - a.dropPct);
}

/**
 * New listings whose coverage sits in the top of what is currently on the market.
 *
 * Uses default financing assumptions on purpose: an alert that moves when you drag
 * the inicial slider is not something you can act on overnight.
 */
export async function loadNewCoverageAlerts(
  since: Date,
  fixed: FixedAssumptions,
  listings: ListingRow[]
): Promise<NewCoverageAlert[]> {
  const withCoverage = listings
    .map((listing) => {
      const finance = financeForListing(listing, DEFAULT_PANEL, fixed);
      return finance ? { listing, coveragePct: finance.coveragePct } : null;
    })
    .filter((row): row is { listing: ListingRow; coveragePct: number } => row != null)
    .sort((a, b) => a.coveragePct - b.coveragePct);

  if (withCoverage.length < 5) return [];

  const thresholdIndex = Math.floor(withCoverage.length * TOP_COVERAGE_PERCENTILE);
  const threshold = withCoverage[Math.min(thresholdIndex, withCoverage.length - 1)].coveragePct;

  const cutoffs = await possiblySoldCutoffs();
  const newcomers = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.SALE,
      firstSeenAt: { gte: since },
      AND: [livePostingWhere(cutoffs)],
    },
    select: { id: true, firstSeenAt: true },
  });
  const newIds = new Set(newcomers.map((p) => p.id));

  return withCoverage
    .filter(({ listing, coveragePct }) => newIds.has(listing.postingId) && coveragePct >= threshold)
    .map(({ listing, coveragePct }) => ({
      kind: 'NEW_HIGH_COVERAGE' as const,
      postingId: listing.postingId,
      propertyId: listing.propertyId,
      sourcePostingId: listing.sourcePostingId,
      sourcePath: listing.sourcePath,
      districtSlug: listing.districtSlug,
      districtName: listing.districtName,
      address: listing.address,
      title: listing.title,
      pricePen: listing.pricePen,
      coveragePct,
      discountPct: listing.discountPct,
      firstSeenAt: newcomers.find((n) => n.id === listing.postingId)!.firstSeenAt.toISOString(),
    }))
    .sort((a, b) => b.coveragePct - a.coveragePct);
}

export interface AlertsBundle {
  since: string;
  priceDrops: PriceDropAlert[];
  newHighCoverage: NewCoverageAlert[];
  coverageThresholdPct: number | null;
  fixedAssumptions: FixedAssumptions;
}

export async function loadAlerts(windowMs = ALERT_WINDOW_MS): Promise<AlertsBundle> {
  const since = new Date(Date.now() - windowMs);
  const [fixed, page, priceDrops] = await Promise.all([
    getFixedAssumptions(),
    loadSaleListings(),
    loadPriceDropAlerts(since),
  ]);

  const newHighCoverage = await loadNewCoverageAlerts(since, fixed, page.listings);

  const withCoverage = page.listings
    .map((l) => financeForListing(l, DEFAULT_PANEL, fixed)?.coveragePct)
    .filter((c): c is number => c != null)
    .sort((a, b) => a - b);
  const threshold =
    withCoverage.length >= 5
      ? withCoverage[Math.floor(withCoverage.length * TOP_COVERAGE_PERCENTILE)]
      : null;

  return {
    since: since.toISOString(),
    priceDrops,
    newHighCoverage,
    coverageThresholdPct: threshold,
    fixedAssumptions: fixed,
  };
}
