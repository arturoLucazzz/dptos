/**
 * What an apartment should cost, and therefore how big a discount is being offered.
 *
 * The naive version is the district average price per m², and it does not work. A
 * 40 m² flat sells for a meaningfully higher price per m² than a 90 m² one without
 * either being mispriced, so comparing both against a single district average makes
 * the 90 m² always look cheap and the 40 m² always look expensive. That column
 * measures size, not opportunity.
 *
 * So: a regression on log price against log area, rooms, parking, age, condition
 * and district. Log-log is what lets the price per m² fall as size rises — the
 * area coefficient comes out below 1 — instead of assuming it is flat.
 *
 * Nothing here is persisted. Fitting is one pass over some tens of thousands of
 * rows plus inverting a matrix of a few dozen columns, which is fast enough to do
 * on demand and cache in memory. That means the model can be changed at any time
 * without a migration and without stale derived columns disagreeing with it.
 */

import { dot, quantile, solveNormalEquations } from './linalg';

export interface Comparable {
  districtSlug: string;
  pricePen: number;
  areaM2: number;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  antiquityYears: number | null;
  /** First sale from the developer, including pre-sale. */
  isNew: boolean;
}

export interface FairPriceSubject {
  districtSlug: string;
  areaM2: number;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  antiquityYears: number | null;
  isNew: boolean;
}

export interface DistrictStats {
  districtSlug: string;
  n: number;
  medianPricePen: number;
  p25PricePen: number;
  p75PricePen: number;
  medianPricePerM2: number;
  p25PricePerM2: number;
  p75PricePerM2: number;
  p05AreaM2: number;
  p95AreaM2: number;
}

export interface FairPricePrediction {
  expectedPen: number;
  /** Positive means the asking price is below the expected price. */
  discountPct: number | null;
  /**
   * How much to trust it. `low` when the district sample is thin or the apartment
   * is outside the size range the district's fit was calibrated on, which is when a
   * regression is most confidently wrong.
   */
  confidence: 'high' | 'low';
  districtStats: DistrictStats | null;
}

export interface FairPriceModel {
  /** Rows the final fit used, after trimming. */
  n: number;
  /** Share of variance in log price explained. */
  r2: number;
  /**
   * Residual spread in log space, which reads directly as a typical percentage
   * error: 0.18 means the model is usually within about 18%.
   */
  typicalErrorPct: number;
  fittedAt: Date;
  districts: readonly string[];
  predict(subject: FairPriceSubject, askingPen?: number | null): FairPricePrediction | null;
  statsFor(districtSlug: string): DistrictStats | null;
}

/** Fewer rows than this and the coefficients are fitted to noise. */
export const MIN_COMPARABLES = 60;
/** A district under this shares the reference level instead of its own coefficient. */
export const MIN_DISTRICT_ROWS = 30;
/** A district under this is reported as low confidence even if it has a coefficient. */
const LOW_CONFIDENCE_DISTRICT_ROWS = 60;
/** Ages beyond this are indistinguishable in practice and would act as leverage. */
const MAX_ANTIQUITY_YEARS = 50;
/** Residuals beyond this many robust deviations are dropped and the model refit. */
const TRIM_DEVIATIONS = 3;

function median(values: number[]): number {
  return quantile(values, 0.5);
}

function isUsableRow(row: Comparable): boolean {
  return (
    Number.isFinite(row.pricePen) &&
    row.pricePen > 0 &&
    Number.isFinite(row.areaM2) &&
    row.areaM2 > 0
  );
}

function cappedAntiquity(years: number | null, fallback: number): number {
  if (years == null || !Number.isFinite(years) || years < 0) return fallback;
  return Math.min(years, MAX_ANTIQUITY_YEARS);
}

/**
 * Fit the model, or return null if the data cannot support one.
 *
 * Returning null matters: a caller with 20 listings should show the district median
 * and say the sample is too small, not a confident prediction from a line drawn
 * through 20 points.
 */
export function fitFairPrice(rows: readonly Comparable[]): FairPriceModel | null {
  const usable = rows.filter(isUsableRow);
  if (usable.length < MIN_COMPARABLES) return null;

  // Imputation values for the listings that omit a feature. Using the market median
  // means a missing bathroom count pulls the prediction toward typical rather than
  // toward zero, which is what an absent field actually implies.
  const defaults = {
    bedrooms: median(usable.map((r) => r.bedrooms).filter((v): v is number => v != null)) || 2,
    bathrooms: median(usable.map((r) => r.bathrooms).filter((v): v is number => v != null)) || 1,
    parkingSpots: median(usable.map((r) => r.parkingSpots).filter((v): v is number => v != null)) || 0,
    antiquityYears:
      median(usable.map((r) => r.antiquityYears).filter((v): v is number => v != null)) || 10,
  };

  // Districts with enough rows get their own coefficient; the rest are pooled into
  // the reference level, whose effect is absorbed by the intercept.
  const counts = new Map<string, number>();
  for (const row of usable) counts.set(row.districtSlug, (counts.get(row.districtSlug) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const dummyDistricts = ranked
    .filter(([, count]) => count >= MIN_DISTRICT_ROWS)
    .map(([slug]) => slug)
    // The largest district is the reference level, so it gets no dummy column.
    .slice(1);
  const dummyIndex = new Map(dummyDistricts.map((slug, i) => [slug, i]));

  const featuresOf = (row: FairPriceSubject): number[] => {
    const x = new Array(6 + dummyDistricts.length).fill(0);
    x[0] = 1;
    x[1] = Math.log(row.areaM2);
    x[2] = row.bedrooms ?? defaults.bedrooms;
    x[3] = row.bathrooms ?? defaults.bathrooms;
    x[4] = row.parkingSpots ?? defaults.parkingSpots;
    x[5] = cappedAntiquity(row.antiquityYears, row.isNew ? 0 : defaults.antiquityYears);
    const index = dummyIndex.get(row.districtSlug);
    if (index != null) x[6 + index] = 1;
    return x;
  };

  const fitOn = (subset: Comparable[]) => {
    const X = subset.map(featuresOf);
    const y = subset.map((r) => Math.log(r.pricePen));
    const beta = solveNormalEquations(X, y);
    if (!beta) return null;
    const residuals = X.map((x, i) => y[i] - dot(x, beta));
    return { beta, residuals, y };
  };

  const first = fitOn(usable);
  if (!first) return null;

  // Trim the listings the model cannot explain at all. These are mostly data
  // problems that survived the quality flags — a garage priced as an apartment, a
  // whole building sold as one unit — and leaving them in drags every coefficient.
  const spread = median(first.residuals.map(Math.abs)) || 1e-6;
  const kept = usable.filter((_, i) => Math.abs(first.residuals[i]) <= TRIM_DEVIATIONS * spread);
  const final = (kept.length >= MIN_COMPARABLES ? fitOn(kept) : null) ?? first;
  const used = final === first ? usable : kept;

  const meanY = final.y.reduce((a, b) => a + b, 0) / final.y.length;
  const ssTot = final.y.reduce((sum, v) => sum + (v - meanY) ** 2, 0);
  const ssRes = final.residuals.reduce((sum, r) => sum + r * r, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  // Robust spread rather than the standard deviation, so a handful of survivors of
  // the trim do not inflate the error the model advertises.
  const typicalErrorPct = 1.4826 * median(final.residuals.map(Math.abs));

  const statsByDistrict = new Map<string, DistrictStats>();
  const byDistrict = new Map<string, Comparable[]>();
  for (const row of used) {
    const list = byDistrict.get(row.districtSlug) ?? [];
    list.push(row);
    byDistrict.set(row.districtSlug, list);
  }
  for (const [slug, districtRows] of byDistrict) {
    const prices = districtRows.map((r) => r.pricePen);
    const perM2 = districtRows.map((r) => r.pricePen / r.areaM2);
    const areas = districtRows.map((r) => r.areaM2);
    statsByDistrict.set(slug, {
      districtSlug: slug,
      n: districtRows.length,
      medianPricePen: median(prices),
      p25PricePen: quantile(prices, 0.25),
      p75PricePen: quantile(prices, 0.75),
      medianPricePerM2: median(perM2),
      p25PricePerM2: quantile(perM2, 0.25),
      p75PricePerM2: quantile(perM2, 0.75),
      p05AreaM2: quantile(areas, 0.05),
      p95AreaM2: quantile(areas, 0.95),
    });
  }

  const beta = final.beta;

  return {
    n: used.length,
    r2,
    typicalErrorPct,
    fittedAt: new Date(),
    districts: [...counts.keys()],
    statsFor: (slug) => statsByDistrict.get(slug) ?? null,
    predict(subject, askingPen) {
      if (!Number.isFinite(subject.areaM2) || subject.areaM2 <= 0) return null;

      const logPrice = dot(featuresOf(subject), beta);
      if (!Number.isFinite(logPrice)) return null;
      // exp of the mean of log price is the median, not the mean, price. For a
      // "what should this cost" number the median is the one wanted anyway.
      const expectedPen = Math.exp(logPrice);
      if (!Number.isFinite(expectedPen) || expectedPen <= 0) return null;

      const stats = statsByDistrict.get(subject.districtSlug) ?? null;
      const thinSample = (stats?.n ?? 0) < LOW_CONFIDENCE_DISTRICT_ROWS;
      const outsideRange =
        stats != null && (subject.areaM2 < stats.p05AreaM2 || subject.areaM2 > stats.p95AreaM2);

      return {
        expectedPen,
        discountPct:
          askingPen != null && askingPen > 0 ? ((expectedPen - askingPen) / expectedPen) * 100 : null,
        confidence: thinSample || outsideRange || stats == null ? 'low' : 'high',
        districtStats: stats,
      };
    },
  };
}
