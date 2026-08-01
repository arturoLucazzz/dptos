/**
 * Estimating what an apartment would rent for.
 *
 * There is no rent figure for a specific apartment on sale, so it is inferred from
 * the rental listings in the same district with a similar number of bedrooms. That
 * makes every coverage number downstream an estimate, and the honest response is not
 * to hide it but to carry the sample size alongside so the UI can say "median of 34
 * listings" or refuse to show a number at all.
 *
 * Rent per m² rather than rent, because it transfers between apartments of different
 * sizes. Bedrooms are bucketed on top of that because two apartments of 70 m² rent
 * differently as a one-bedroom and as a three-bedroom.
 */

import { quantile } from './linalg';

export interface RentObservation {
  districtSlug: string;
  pricePen: number;
  areaM2: number;
  bedrooms: number | null;
}

/** Bedrooms above this are pooled: there are too few to measure separately. */
const MAX_BEDROOM_BUCKET = 4;

/** Rentals needed before a median is reported for a district and bedroom count. */
export const MIN_RENT_SAMPLE = 8;
/** Below this the estimate is reported as weak rather than withheld. */
const LOW_CONFIDENCE_SAMPLE = 20;

export function bedroomBucket(bedrooms: number | null | undefined): number | null {
  if (bedrooms == null || !Number.isFinite(bedrooms) || bedrooms < 0) return null;
  return Math.min(Math.round(bedrooms), MAX_BEDROOM_BUCKET);
}

export interface RentCell {
  districtSlug: string;
  /** Null for the district-wide row, which is the fallback. */
  bedrooms: number | null;
  n: number;
  medianPerM2: number;
  p25PerM2: number;
  p75PerM2: number;
}

export interface RentIndex {
  cells: readonly RentCell[];
  lookup(districtSlug: string, bedrooms: number | null): RentCell | null;
}

function cellFrom(
  districtSlug: string,
  bedrooms: number | null,
  perM2: number[]
): RentCell {
  return {
    districtSlug,
    bedrooms,
    n: perM2.length,
    medianPerM2: quantile(perM2, 0.5),
    p25PerM2: quantile(perM2, 0.25),
    p75PerM2: quantile(perM2, 0.75),
  };
}

/**
 * Build the district × bedrooms table of rent per m².
 *
 * Each district also gets a bedroom-agnostic row, used when a specific combination
 * is too thin. That fallback is worse but still district-specific, which beats
 * falling back to a city-wide number that mixes Lince with Miraflores.
 */
export function buildRentIndex(rows: readonly RentObservation[]): RentIndex {
  const byKey = new Map<string, number[]>();
  const byDistrict = new Map<string, number[]>();

  for (const row of rows) {
    if (!(row.pricePen > 0) || !(row.areaM2 > 0)) continue;
    const perM2 = row.pricePen / row.areaM2;

    const district = byDistrict.get(row.districtSlug) ?? [];
    district.push(perM2);
    byDistrict.set(row.districtSlug, district);

    const bucket = bedroomBucket(row.bedrooms);
    if (bucket == null) continue;
    const key = `${row.districtSlug}|${bucket}`;
    const list = byKey.get(key) ?? [];
    list.push(perM2);
    byKey.set(key, list);
  }

  const cells: RentCell[] = [];
  for (const [key, perM2] of byKey) {
    if (perM2.length < MIN_RENT_SAMPLE) continue;
    const [districtSlug, bedrooms] = key.split('|');
    cells.push(cellFrom(districtSlug, Number(bedrooms), perM2));
  }
  for (const [districtSlug, perM2] of byDistrict) {
    if (perM2.length < MIN_RENT_SAMPLE) continue;
    cells.push(cellFrom(districtSlug, null, perM2));
  }

  const index = new Map(cells.map((cell) => [`${cell.districtSlug}|${cell.bedrooms ?? '*'}`, cell]));

  return {
    cells,
    lookup(districtSlug, bedrooms) {
      const bucket = bedroomBucket(bedrooms);
      if (bucket != null) {
        const exact = index.get(`${districtSlug}|${bucket}`);
        if (exact) return exact;
      }
      return index.get(`${districtSlug}|*`) ?? null;
    },
  };
}

export interface RentEstimate {
  /** Monthly rent before vacancy, tax and costs. Deductions happen in the client. */
  grossRentPen: number;
  /** Listings the median came from. */
  n: number;
  /** True when the bedroom-specific sample was too thin and the district was used. */
  usedDistrictFallback: boolean;
  confidence: 'high' | 'low';
}

/**
 * Estimated monthly rent for an apartment, or null when there is nothing to base it
 * on.
 *
 * Null is a real answer here. A coverage percentage computed from a rent estimate
 * that came from three listings looks exactly like one computed from three hundred,
 * and only one of them means anything.
 */
export function estimateGrossRent(
  index: RentIndex,
  subject: { districtSlug: string; areaM2: number | null; bedrooms: number | null }
): RentEstimate | null {
  if (subject.areaM2 == null || !(subject.areaM2 > 0)) return null;

  const bucket = bedroomBucket(subject.bedrooms);
  const cell = index.lookup(subject.districtSlug, subject.bedrooms);
  if (!cell) return null;

  const usedDistrictFallback = cell.bedrooms == null && bucket != null;
  return {
    grossRentPen: cell.medianPerM2 * subject.areaM2,
    n: cell.n,
    usedDistrictFallback,
    confidence: cell.n >= LOW_CONFIDENCE_SAMPLE && !usedDistrictFallback ? 'high' : 'low',
  };
}
