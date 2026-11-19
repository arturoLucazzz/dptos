/**
 * The refresh step: load places, zones, district statistics, and rent listings, score every
 * tracked apartment, and replace the stored PropertyLocation rows in one transaction.
 * The scrape runs it at the end of each run; zone saves and `pnpm location:refresh` too.
 *
 * Takes the client as an argument so tests can import the pure parts without a database.
 */

import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { Operation, PostingKind, ScrapeStatus, ZoneKind } from '../generated/prisma/enums';
import { cutoffsFromRuns, livePostingWhere, notLivePostingWhere } from '../possibly-sold';
import { isUsableComparable, pricePerM2OutlierMask } from '../quality-flags';
import type { Ring } from './geo';
import { LIMA_PROVINCE_DISTRICTS } from './lima-districts';
import type { RentPoint } from './local-rent';
import { readLatestStats } from '../stats/store';
import { SCORE_INDICATORS, SCORE_LEFT_OUT, scoreAll, type LocationResult, type PlaceCategory, type RentActivityPoint, type ScoreSubject } from './score';
import type { ZoneShape } from './zones';

const GONE_WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;

type ScoreInput = Parameters<typeof scoreAll>[0];

const num = (d: Prisma.Decimal | number | null | undefined): number | null => (d == null ? null : Number(d));
const round1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

function firstCoordinates(
  candidates: ({ latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null } | null | undefined)[],
): { lat: number; lon: number } | null {
  for (const c of candidates) {
    if (c?.latitude != null && c.longitude != null) return { lat: Number(c.latitude), lon: Number(c.longitude) };
  }
  return null;
}

export async function loadScoreInput(db: PrismaClient): Promise<ScoreInput> {
  const runs = await db.scrapeRun.findMany({
    where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
    select: { startedAt: true, sources: true, districtCounts: true },
  });
  const cutoffs = cutoffsFromRuns(runs);
  const liveSale = { kind: PostingKind.UNIT, operation: Operation.SALE, AND: [livePostingWhere(cutoffs)] };

  const properties = await db.property.findMany({
    where: { postings: { some: liveSale } },
    select: {
      id: true,
      districtSlug: true,
      bedrooms: true,
      latitude: true,
      longitude: true,
      postings: {
        where: liveSale,
        select: { currentSnapshot: { select: { latitude: true, longitude: true } } },
      },
    },
  });
  const subjects: ScoreSubject[] = properties.map((p) => {
    const point = firstCoordinates([...p.postings.map((x) => x.currentSnapshot), p]);
    return { propertyId: p.id, districtSlug: p.districtSlug, bedrooms: p.bedrooms, lat: point?.lat ?? null, lon: point?.lon ?? null };
  });

  // Rents for the local estimate: the same filter as loadRentObservations, plus coordinates.
  const livePostings = await db.posting.findMany({
    where: { kind: PostingKind.UNIT, operation: Operation.RENT, AND: [livePostingWhere(cutoffs)], currentSnapshot: { isNot: null } },
    select: {
      propertyId: true,
      id: true,
      districtSlug: true,
      currentSnapshot: {
        select: { pricePen: true, areaTotal: true, areaCovered: true, bedrooms: true, qualityFlags: true, latitude: true, longitude: true },
      },
    },
  });
  const rentRows: (RentPoint & { districtSlug: string; pricePen: number; areaM2: number; key: string })[] = [];
  const rentActivity: RentActivityPoint[] = [];
  for (const posting of livePostings) {
    const s = posting.currentSnapshot;
    const point = firstCoordinates([s]);
    if (!s || !point) continue;
    rentActivity.push({ ...point, live: true, daysOnline: null });
    const area = num(s.areaTotal ?? s.areaCovered);
    const price = num(s.pricePen);
    if (!isUsableComparable(s.qualityFlags) || price == null || area == null || area <= 0) continue;
    rentRows.push({ ...point, districtSlug: posting.districtSlug, pricePen: price, areaM2: area, perM2: price / area, bedrooms: s.bedrooms, key: posting.propertyId ?? posting.id });
  }
  const outliers = pricePerM2OutlierMask(rentRows);
  // One rent per property, at its lowest price: a copy on a second source is the same flat.
  const byProperty = new Map<string, (typeof rentRows)[number]>();
  rentRows.forEach((row, i) => {
    if (outliers[i]) return;
    const seen = byProperty.get(row.key);
    if (!seen || row.pricePen < seen.pricePen) byProperty.set(row.key, row);
  });
  const rents: RentPoint[] = [...byProperty.values()].map(({ lat, lon, perM2, bedrooms }) => ({ lat, lon, perM2, bedrooms }));

  const since = new Date(Date.now() - GONE_WINDOW_DAYS * DAY_MS);
  const gone = await db.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation: Operation.RENT,
      AND: [notLivePostingWhere(cutoffs), { OR: [{ removedAt: { gte: since } }, { removedAt: null, lastSeenAt: { gte: since } }] }],
    },
    select: { firstSeenAt: true, lastSeenAt: true, removedAt: true, currentSnapshot: { select: { latitude: true, longitude: true } } },
  });
  for (const g of gone) {
    const point = firstCoordinates([g.currentSnapshot]);
    if (!point) continue;
    const end = g.removedAt ?? g.lastSeenAt;
    rentActivity.push({ ...point, live: false, daysOnline: Math.max(0, (end.getTime() - g.firstSeenAt.getTime()) / DAY_MS) });
  }

  const [placeRows, zoneRows, statRows, latest] = await Promise.all([
    db.place.findMany({ select: { category: true, latitude: true, longitude: true } }),
    db.zone.findMany(),
    db.districtStat.findMany({ select: { slug: true, boundary: true } }),
    readLatestStats(db),
  ]);
  const boundaries = new Map(statRows.map((s) => [s.slug, s.boundary as Ring[] | null]));
  const zones: ZoneShape[] = [];
  for (const z of zoneRows) {
    if (z.kind === ZoneKind.CIRCLE && z.latitude != null && z.longitude != null && z.radiusM != null) {
      zones.push({ id: z.id, name: z.name, rating: z.rating, kind: 'CIRCLE', lat: Number(z.latitude), lon: Number(z.longitude), radiusM: z.radiusM });
    } else if (z.kind === ZoneKind.DISTRICT && z.districtSlug) {
      const rings = boundaries.get(z.districtSlug);
      // No boundary (location:places never ran): the zone cannot be placed, so it is skipped.
      if (rings && rings.length > 0) zones.push({ id: z.id, name: z.name, rating: z.rating, kind: 'DISTRICT', districtSlug: z.districtSlug, rings });
    }
  }

  return {
    subjects,
    places: placeRows.map((p) => ({ category: p.category as PlaceCategory, lat: Number(p.latitude), lon: Number(p.longitude) })),
    zones,
    districtStats: LIMA_PROVINCE_DISTRICTS.map(({ slug }) => {
      const stats = latest.get(slug);
      const pick = (indicator: string) => {
        const s = stats?.get(indicator);
        return s ? { value: s.value, period: s.period } : null;
      };
      // An indicator in SCORE_LEFT_OUT stays undefined: no signal and no reason.
      const use = (indicator: string) => (SCORE_LEFT_OUT.has(indicator) ? undefined : pick(indicator));
      return {
        slug,
        highIncomePct: use(SCORE_INDICATORS.highIncome),
        povertyPct: use(SCORE_INDICATORS.poverty),
        complaintsPer10k: use(SCORE_INDICATORS.complaints),
      };
    }),
    rentActivity,
    rents,
  };
}

export function buildRows(results: LocationResult[], computedAt: Date): Prisma.PropertyLocationCreateManyInput[] {
  return results.map((r) => ({
    propertyId: r.propertyId,
    status: r.status,
    score: round1(r.score),
    livability: round1(r.livability),
    demand: round1(r.demand),
    reasons: r.reasons,
    localRentPerM2: r.localRent?.middlePerM2 ?? null,
    localRentHighPerM2: r.localRent?.highPerM2 ?? null,
    localRentN: r.localRent?.n ?? null,
    localRentMaxDistanceM: r.localRent ? Math.round(r.localRent.maxDistanceM) : null,
    computedAt,
  }));
}

export async function refreshLocations(db: PrismaClient): Promise<{ scored: number; outsideLima: number; noCoordinates: number }> {
  const results = scoreAll(await loadScoreInput(db));
  const rows = buildRows(results, new Date());
  await db.$transaction(
    async (tx) => {
      await tx.propertyLocation.deleteMany();
      for (let i = 0; i < rows.length; i += 5_000) await tx.propertyLocation.createMany({ data: rows.slice(i, i + 5_000) });
    },
    { timeout: 120_000 },
  );
  return {
    scored: results.filter((r) => r.status === 'OK').length,
    outsideLima: results.filter((r) => r.status === 'OUTSIDE_LIMA').length,
    noCoordinates: results.filter((r) => r.status === 'NO_COORDINATES').length,
  };
}
