/**
 * Market analytics that answer the three questions the app exists for.
 *
 * 1. Are prices going up? — and is that real, or just the cheap ones selling and
 *    leaving the expensive ones hanging? The index on disappeared listings is the
 *    correction; the live index is what survival bias looks like.
 * 2. How much inventory is there, and how liquid is it? Counts are by Property, so
 *    three brokers on one apartment do not count as three.
 * 3. Where is new supply coming? Projects are not buy candidates; they are an early
 *    warning that rent coverage in that district will get harder.
 */

import { prisma } from './db';
import { Operation, PostingKind } from './generated/prisma/enums';
import { median, quantile } from './linalg';
import { possiblySoldCutoffs } from './market';
import { isLivePosting, livePostingWhere } from './possibly-sold';
import { isUsableComparable } from './quality-flags';
import { weekKey } from './dates';

export { weekKey } from './dates';

function titleCaseDistrict(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export interface PriceIndexPoint {
  week: string;
  /** Median price/m² of listings still live that week. */
  livePerM2: number | null;
  liveN: number;
  /**
   * Median last asking price/m² of listings that crossed into possibly-sold that
   * week. This is the index that does not suffer from survival bias.
   */
  exitedPerM2: number | null;
  exitedN: number;
}

export interface DistrictInventory {
  districtSlug: string;
  districtName: string;
  /** Distinct properties for sale, not listings. */
  saleProperties: number;
  rentProperties: number;
  /**
   * sale / rent. High means more sellers than renters available — a liquidity
   * signal, not a verdict. Null when there is nothing for rent.
   */
  saleToRent: number | null;
  /** Interquartile range of sale price/m² over the median, as a share. */
  saleDispersion: number | null;
  saleMedianPerM2: number | null;
  saleP25PerM2: number | null;
  saleP75PerM2: number | null;
  saleN: number;
}

export interface ConstructionPipeline {
  districtSlug: string;
  districtName: string;
  enPlanos: number;
  enConstruccion: number;
  entregaInmediata: number;
  other: number;
  total: number;
  /** Sum of unitsCount when Urbania publishes it; otherwise project count. */
  unitsApprox: number;
}

function stageBucket(stage: string | null): keyof Pick<
  ConstructionPipeline,
  'enPlanos' | 'enConstruccion' | 'entregaInmediata' | 'other'
> {
  const s = (stage ?? '').toLowerCase();
  if (s.includes('plano')) return 'enPlanos';
  if (s.includes('construc')) return 'enConstruccion';
  if (s.includes('inmediata') || s.includes('entrega')) return 'entregaInmediata';
  return 'other';
}

/**
 * Weekly price/m² for live listings and for listings that exited.
 *
 * "Exited" means lastSeenAt fell behind its source's possibly-sold cutoff, or the
 * posting was removed — the best proxy for sold that reversible state gives. Using their *last* asking price is the
 * point: the cheap ones leave, and without them the live median drifts up even when
 * nothing got more expensive.
 */
export async function loadPriceIndex(operation: Operation): Promise<PriceIndexPoint[]> {
  const cutoffs = await possiblySoldCutoffs();

  const postings = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      operation,
      currentSnapshot: { isNot: null },
    },
    select: {
      source: true,
      lastSeenAt: true,
      removedAt: true,
      firstSeenAt: true,
      currentSnapshot: {
        select: {
          pricePen: true,
          areaTotal: true,
          areaCovered: true,
          qualityFlags: true,
          observedAt: true,
        },
      },
      snapshots: {
        orderBy: { observedAt: 'asc' },
        select: { pricePen: true, areaTotal: true, areaCovered: true, observedAt: true, qualityFlags: true },
      },
    },
  });

  const liveByWeek = new Map<string, number[]>();
  const exitedByWeek = new Map<string, number[]>();

  for (const posting of postings) {
    const snap = posting.currentSnapshot;
    if (!snap || snap.pricePen == null) continue;
    if (!isUsableComparable(snap.qualityFlags)) continue;
    const area = snap.areaTotal ?? snap.areaCovered;
    if (area == null || Number(area) <= 0) continue;
    const perM2 = Number(snap.pricePen) / Number(area);

    const live = isLivePosting(posting, cutoffs);
    if (live) {
      // A live listing contributes to every week it has been on the market, using
      // the current price as a coarse stand-in. With short history that is fine;
      // with long history the snapshot trail below is preferred.
      const weeks = new Set<string>();
      for (const s of posting.snapshots) weeks.add(weekKey(s.observedAt));
      weeks.add(weekKey(posting.lastSeenAt));
      for (const week of weeks) {
        const list = liveByWeek.get(week) ?? [];
        list.push(perM2);
        liveByWeek.set(week, list);
      }
    } else {
      const week = weekKey(posting.lastSeenAt);
      const list = exitedByWeek.get(week) ?? [];
      list.push(perM2);
      exitedByWeek.set(week, list);
    }
  }

  const weeks = [...new Set([...liveByWeek.keys(), ...exitedByWeek.keys()])].sort();
  return weeks.map((week) => {
    const live = liveByWeek.get(week) ?? [];
    const exited = exitedByWeek.get(week) ?? [];
    return {
      week,
      livePerM2: live.length ? median(live) : null,
      liveN: live.length,
      exitedPerM2: exited.length ? median(exited) : null,
      exitedN: exited.length,
    };
  });
}

/**
 * Inventory and dispersion per district, deduplicated by Property.
 *
 * One apartment listed by three brokers is one property. Counting listings instead
 * would call a multi-listed district "deep" when it is just noisy.
 */
export async function loadDistrictInventory(): Promise<DistrictInventory[]> {
  const cutoffs = await possiblySoldCutoffs();

  const postings = await prisma.posting.findMany({
    where: {
      kind: PostingKind.UNIT,
      AND: [livePostingWhere(cutoffs)],
      currentSnapshot: { isNot: null },
      OR: [{ propertyId: null }, { property: { discarded: false } }],
    },
    select: {
      districtSlug: true,
      operation: true,
      propertyId: true,
      id: true,
      currentSnapshot: {
        select: {
          pricePen: true,
          areaTotal: true,
          areaCovered: true,
          qualityFlags: true,
        },
      },
    },
  });

  type Acc = {
    saleProps: Set<string>;
    rentProps: Set<string>;
    salePerM2: number[];
  };
  const byDistrict = new Map<string, Acc>();

  for (const posting of postings) {
    const snap = posting.currentSnapshot;
    if (!snap) continue;
    const acc = byDistrict.get(posting.districtSlug) ?? {
      saleProps: new Set(),
      rentProps: new Set(),
      salePerM2: [],
    };
    const key = posting.propertyId ?? `posting:${posting.id}`;
    if (posting.operation === Operation.SALE) {
      acc.saleProps.add(key);
      if (isUsableComparable(snap.qualityFlags) && snap.pricePen != null) {
        const area = snap.areaTotal ?? snap.areaCovered;
        if (area != null && Number(area) > 0) {
          acc.salePerM2.push(Number(snap.pricePen) / Number(area));
        }
      }
    } else {
      acc.rentProps.add(key);
    }
    byDistrict.set(posting.districtSlug, acc);
  }

  return [...byDistrict.entries()]
    .map(([slug, acc]) => {
      const saleN = acc.salePerM2.length;
      const p25 = saleN ? quantile(acc.salePerM2, 0.25) : null;
      const p50 = saleN ? median(acc.salePerM2) : null;
      const p75 = saleN ? quantile(acc.salePerM2, 0.75) : null;
      const dispersion =
        p25 != null && p50 != null && p75 != null && p50 > 0 ? (p75 - p25) / p50 : null;
      return {
        districtSlug: slug,
        districtName: titleCaseDistrict(slug),
        saleProperties: acc.saleProps.size,
        rentProperties: acc.rentProps.size,
        saleToRent: acc.rentProps.size > 0 ? acc.saleProps.size / acc.rentProps.size : null,
        saleDispersion: dispersion,
        saleMedianPerM2: p50,
        saleP25PerM2: p25,
        saleP75PerM2: p75,
        saleN,
      };
    })
    .sort((a, b) => b.saleProperties - a.saleProperties);
}

/**
 * Projects under construction, by district and stage.
 *
 * These are not buy candidates — their price is a "desde". They are an early signal
 * that a district is about to absorb new units, which pressures rents and therefore
 * the coverage numbers of everything already bought there.
 */
export async function loadConstructionPipeline(): Promise<ConstructionPipeline[]> {
  const cutoffs = await possiblySoldCutoffs();

  const projects = await prisma.posting.findMany({
    where: {
      kind: PostingKind.PROJECT,
      operation: Operation.SALE,
      AND: [livePostingWhere(cutoffs)],
      currentSnapshot: { isNot: null },
    },
    select: {
      districtSlug: true,
      currentSnapshot: {
        select: { developmentStage: true, unitsCount: true },
      },
    },
  });

  const byDistrict = new Map<string, ConstructionPipeline>();
  for (const project of projects) {
    const snap = project.currentSnapshot;
    if (!snap) continue;
    const row =
      byDistrict.get(project.districtSlug) ??
      ({
        districtSlug: project.districtSlug,
        districtName: titleCaseDistrict(project.districtSlug),
        enPlanos: 0,
        enConstruccion: 0,
        entregaInmediata: 0,
        other: 0,
        total: 0,
        unitsApprox: 0,
      } satisfies ConstructionPipeline);
    const bucket = stageBucket(snap.developmentStage);
    row[bucket] += 1;
    row.total += 1;
    row.unitsApprox += snap.unitsCount && snap.unitsCount > 0 ? snap.unitsCount : 1;
    byDistrict.set(project.districtSlug, row);
  }

  return [...byDistrict.values()].sort((a, b) => b.unitsApprox - a.unitsApprox);
}

export interface AnalyticsBundle {
  saleIndex: PriceIndexPoint[];
  rentIndex: PriceIndexPoint[];
  inventory: DistrictInventory[];
  construction: ConstructionPipeline[];
  scrapedAt: string | null;
}
