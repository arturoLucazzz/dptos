/**
 * Estimating how long a listing has been published, on day one.
 *
 * Only about 4% of cards carry `firstDateOnline`, and `firstSeenAt` is useless at
 * the start: on the first run every listing in Lima looks one day old, so "days on
 * market" — the single best signal of a seller who cannot sell — would need months
 * of observation before it said anything.
 *
 * Urbania's posting ids are allocated roughly in order (144855239 in April,
 * 150420250 in July), so the ids of the few listings that *do* report a date
 * calibrate a line that dates all the others, including retroactively. The
 * estimate is coarse — a few weeks of error — which is fine for "3 months on the
 * market" and not fine for "published last Tuesday", so callers get the fit
 * quality and are expected to keep estimates visibly separate from observations.
 */

export interface IdDateAnchor {
  /** Urbania's numeric posting id. */
  id: number;
  publishedAt: Date;
}

export interface IdDateModel {
  /** Milliseconds of publication date per unit of id. */
  slope: number;
  intercept: number;
  /** Anchors used after outliers were dropped. */
  n: number;
  /** Share of variance explained, 0 to 1. */
  r2: number;
  /** Typical absolute error in days, from the residuals of the fit. */
  medianErrorDays: number;
  /** Range of ids the fit was calibrated on; outside it this extrapolates. */
  minId: number;
  maxId: number;
}

/**
 * Ids below this belong to an older numbering scheme and carry no date signal.
 *
 * Live Lince listings include ids like 4681404 and 61535155 next to 150421623.
 * They are not outliers to be down-weighted, they are a different id space, and
 * because they sit far out on the x axis they would dominate any fit that let them
 * in. Their dates are still recorded; they just cannot calibrate or be calibrated.
 */
export const MIN_MODERN_ID = 100_000_000;

/** Below this the line is noise fitted to a handful of points. */
export const MIN_ANCHORS = 12;
/** Below this the ids are not sequential enough to date anything. */
export const MIN_R2 = 0.7;
/** Residuals beyond this many median absolute deviations are dropped and refit. */
const OUTLIER_MADS = 3;
/**
 * Floor on the outlier tolerance.
 *
 * Ids are allocated unevenly enough that a few weeks off the line is normal, and
 * without a floor a very tight fit would reject its own noise: when the residuals
 * are near zero, three MADs is also near zero.
 */
const MIN_OUTLIER_TOLERANCE_MS = 45 * 86_400_000;

const MS_PER_DAY = 86_400_000;

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Line {
  slope: number;
  intercept: number;
  r2: number;
}

/** Anchors above this are thinned before the O(n²) pairwise slope estimate. */
const MAX_PAIRWISE_POINTS = 300;

/**
 * Theil-Sen: the median of the slopes of every pair of points.
 *
 * Used instead of least squares for the first pass because the outliers here have
 * high leverage. A listing republished under an id far outside the observed range
 * sits alone at one end of the x axis, and least squares bends the line to pass
 * near it, spreading the error over the forty honest points instead. The median
 * slope cannot be moved by one pair, so the outlier stays visible as a residual.
 */
function theilSen(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const sample =
    points.length <= MAX_PAIRWISE_POINTS
      ? points
      : points.filter((_, i) => i % Math.ceil(points.length / MAX_PAIRWISE_POINTS) === 0);

  const slopes: number[] = [];
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const dx = sample[j].x - sample[i].x;
      if (dx !== 0) slopes.push((sample[j].y - sample[i].y) / dx);
    }
  }
  if (slopes.length === 0) return null;

  const slope = median(slopes);
  return { slope, intercept: median(points.map((p) => p.y - slope * p.x)) };
}

function leastSquares(points: { x: number; y: number }[]): Line | null {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    sxx += dx * dx;
    sxy += dx * (p.y - meanY);
  }
  // Every anchor shares one id: no slope is defined.
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - predicted) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

/**
 * Fit `id → publication date` from the listings that report one.
 *
 * Returns null rather than a weak model, because a bad date silently poisons every
 * "days on market" number downstream. Two passes: a robust line to find the
 * republished listings whose id no longer matches their date, then a least-squares
 * fit on what survives, which is what gives a usable r².
 */
export function fitIdToDate(anchors: readonly IdDateAnchor[]): IdDateModel | null {
  const points = anchors
    .filter((a) => Number.isFinite(a.id) && a.id >= MIN_MODERN_ID && !Number.isNaN(a.publishedAt.getTime()))
    .map((a) => ({ x: a.id, y: a.publishedAt.getTime() }))
    .sort((a, b) => a.x - b.x);

  if (points.length < MIN_ANCHORS) return null;

  const robust = theilSen(points);
  if (!robust) return null;

  const residuals = points.map((p) => Math.abs(p.y - (robust.slope * p.x + robust.intercept)));
  const tolerance = Math.max(OUTLIER_MADS * median(residuals), MIN_OUTLIER_TOLERANCE_MS);
  const kept = points.filter((p, i) => residuals[i] <= tolerance);

  const used = kept.length >= MIN_ANCHORS ? kept : points;
  const fit = leastSquares(used);
  if (!fit || fit.r2 < MIN_R2) return null;

  const finalResiduals = used.map((p) => Math.abs(p.y - (fit.slope * p.x + fit.intercept)));

  return {
    slope: fit.slope,
    intercept: fit.intercept,
    n: used.length,
    r2: fit.r2,
    medianErrorDays: median(finalResiduals) / MS_PER_DAY,
    minId: Math.min(...used.map((p) => p.x)),
    maxId: Math.max(...used.map((p) => p.x)),
  };
}

export interface AgeEstimate {
  publishedAt: Date;
  /** True when the id falls outside the calibrated range, so the error is larger. */
  extrapolated: boolean;
}

/** Publication date implied by an id, or null if the id is unusable. */
export function estimatePublishedAt(
  model: IdDateModel,
  sourcePostingId: string | number
): AgeEstimate | null {
  const id = typeof sourcePostingId === 'number' ? sourcePostingId : Number(sourcePostingId);
  if (!Number.isFinite(id) || id < MIN_MODERN_ID) return null;

  const ms = model.slope * id + model.intercept;
  if (!Number.isFinite(ms)) return null;

  return {
    publishedAt: new Date(ms),
    extrapolated: id < model.minId || id > model.maxId,
  };
}

/**
 * Best available publication date: what Urbania reported, else what the ids imply.
 *
 * Ordering matters. A reported date is a fact and an estimate is a guess, so the
 * fact wins whenever it exists, and `estimated` tells the UI which one it got.
 */
export function publishedAtFor(input: {
  firstDateOnline: Date | null;
  sourcePostingId: string | number;
  firstSeenAt: Date;
  model: IdDateModel | null;
}): { publishedAt: Date; estimated: boolean } {
  if (input.firstDateOnline) return { publishedAt: input.firstDateOnline, estimated: false };

  const estimate = input.model ? estimatePublishedAt(input.model, input.sourcePostingId) : null;
  // An estimate later than the day we first saw it is impossible; the listing
  // existed then, so that observation is the better bound.
  if (estimate && estimate.publishedAt < input.firstSeenAt) {
    return { publishedAt: estimate.publishedAt, estimated: true };
  }
  return { publishedAt: input.firstSeenAt, estimated: true };
}

export function daysOnMarket(publishedAt: Date, asOf: Date = new Date()): number {
  return Math.max(0, Math.floor((asOf.getTime() - publishedAt.getTime()) / MS_PER_DAY));
}
