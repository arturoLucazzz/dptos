/**
 * Implausible listings get marked, never deleted.
 *
 * Deleting is what the old JSON pipeline did with `price < 100000`, and it has a
 * non-obvious cost: once a listing is dropped, the next run sees it missing and
 * counts it as a sale. Marking keeps the row and lets the queries filter.
 *
 * There is no hard cap on rent either. San Isidro and Miraflores genuinely have
 * apartments renting for S/ 12,000-20,000, so a ceiling at 10,000 would erase
 * real listings. The robust rule is not a maximum amount but detecting an
 * operation that was classified wrong by orders of magnitude.
 */

import { median } from './linalg';

export const QUALITY_FLAGS = [
  'IMPLAUSIBLE_SALE_PRICE',
  'PROBABLY_RENT',
  'IMPLAUSIBLE_RENT',
  'PROBABLY_SALE',
  'IMPLAUSIBLE_AREA',
  'OUTLIER_PRICE_PER_M2',
  'MISSING_PRICE',
  'MISSING_AREA',
  'PRICE_IS_FROM',
  'SLUG_BEDROOMS_MISMATCH',
  'SLUG_DISTRICT_MISMATCH',
] as const;

export type QualityFlag = (typeof QUALITY_FLAGS)[number];

/** A sale below this is not a sale price in Lima. */
export const IMPLAUSIBLE_SALE_PRICE_PEN = 100_000;
/** Below this it is almost certainly a monthly rent filed as a sale. */
export const PROBABLY_RENT_PEN = 10_000;
/** Above this a monthly rent stops being credible even for a penthouse. */
export const IMPLAUSIBLE_RENT_PEN = 30_000;
/** Above this a "rent" is a sale price. */
export const PROBABLY_SALE_PEN = 100_000;
export const MIN_PLAUSIBLE_AREA_M2 = 15;
export const MAX_PLAUSIBLE_AREA_M2 = 500;

export interface FlagInput {
  operation: 'SALE' | 'RENT';
  pricePen: number | null;
  areaM2: number | null;
  priceIsFrom?: boolean;
}

/**
 * Flags that depend only on the listing itself. The per-district price/m² outlier
 * flag needs the district distribution and is applied separately.
 */
export function flagsForListing(input: FlagInput): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const { operation, pricePen, areaM2 } = input;

  if (pricePen == null) {
    flags.push('MISSING_PRICE');
  } else if (operation === 'SALE') {
    if (pricePen < PROBABLY_RENT_PEN) flags.push('PROBABLY_RENT');
    else if (pricePen < IMPLAUSIBLE_SALE_PRICE_PEN) flags.push('IMPLAUSIBLE_SALE_PRICE');
  } else {
    if (pricePen > PROBABLY_SALE_PEN) flags.push('PROBABLY_SALE');
    else if (pricePen > IMPLAUSIBLE_RENT_PEN) flags.push('IMPLAUSIBLE_RENT');
  }

  if (areaM2 == null) {
    flags.push('MISSING_AREA');
  } else if (areaM2 < MIN_PLAUSIBLE_AREA_M2 || areaM2 > MAX_PLAUSIBLE_AREA_M2) {
    flags.push('IMPLAUSIBLE_AREA');
  }

  // A project price is a lower bound, so it is not wrong, but it is never a
  // comparable and every query that averages prices has to know.
  if (input.priceIsFrom) flags.push('PRICE_IS_FROM');

  return flags;
}

/**
 * Rows needed before a district's price distribution can judge anything.
 */
export const MIN_ROWS_FOR_OUTLIER_TEST = 30;
/**
 * Deviations from the district's median price per m² beyond which a listing is an
 * outlier. Four is wide on purpose: a genuine penthouse at twice the district
 * median must survive, while a 60 m² flat asking S/ 55,275,000 — a real listing,
 * at 122 times the median per m² — must not.
 */
export const OUTLIER_DEVIATIONS = 4;

/** Scale factor that turns a median absolute deviation into a standard deviation. */
const MAD_TO_SIGMA = 1.4826;

export interface PriceOutlierRow {
  districtSlug: string;
  pricePen: number | null;
  areaM2: number | null;
}

/**
 * Which listings are priced absurdly for their district, per m².
 *
 * Deliberately relative rather than an absolute ceiling. An absolute cap on sale
 * prices would have to be high enough for San Isidro penthouses, which makes it too
 * high to catch anything in Lince. The comparison is against the listing's own
 * district, in log space so it is symmetric between "ten times too much" and "a
 * tenth of the price", and around the median so the outliers do not set the
 * threshold that is meant to catch them.
 *
 * This flag is *not* stored on the snapshot, unlike the rest. It is not a property
 * of the observation: the same listing stops being an outlier when the district
 * around it changes, so storing it would mean a value that quietly goes stale.
 * It is recomputed wherever the distribution is already in hand.
 */
export function pricePerM2OutlierMask(rows: readonly PriceOutlierRow[]): boolean[] {
  const logPerM2 = rows.map((row) =>
    row.pricePen != null && row.pricePen > 0 && row.areaM2 != null && row.areaM2 > 0
      ? Math.log(row.pricePen / row.areaM2)
      : null
  );

  const byDistrict = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const value = logPerM2[i];
    if (value == null) return;
    const list = byDistrict.get(row.districtSlug) ?? [];
    list.push(value);
    byDistrict.set(row.districtSlug, list);
  });

  const bounds = new Map<string, { low: number; high: number }>();
  for (const [slug, values] of byDistrict) {
    if (values.length < MIN_ROWS_FOR_OUTLIER_TEST) continue;
    const centre = median(values);
    const sigma = MAD_TO_SIGMA * median(values.map((v) => Math.abs(v - centre)));
    // Every listing at the same price per m²: nothing to call an outlier.
    if (!(sigma > 0)) continue;
    bounds.set(slug, {
      low: centre - OUTLIER_DEVIATIONS * sigma,
      high: centre + OUTLIER_DEVIATIONS * sigma,
    });
  }

  return rows.map((row, i) => {
    const value = logPerM2[i];
    const bound = bounds.get(row.districtSlug);
    if (value == null || !bound) return false;
    return value < bound.low || value > bound.high;
  });
}

/**
 * Cross-check the listing against the URL slug Urbania generated for it.
 *
 * The slug carries Urbania's own parse of the same listing
 * ("...-venta-de-departamento-en-lince-lima-1-dormitorio-149368316"), so it is a
 * second opinion that costs nothing: if the slug says one bedroom and the
 * features say three, one of the two is wrong and the row should not be trusted
 * silently. The slug is not usable as an identifier (it changes between the
 * canonical URL and the card's own link, and it encodes mutable attributes), but
 * that same mutability is what makes it a useful check.
 */
export function flagsFromSlug(input: {
  sourcePath: string | null | undefined;
  bedrooms: number | null | undefined;
  districtName: string | null | undefined;
}): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (!input.sourcePath) return flags;
  const slug = input.sourcePath.toLowerCase();

  const bedroomMatch = slug.match(/(\d+)-dormitorios?/);
  if (bedroomMatch && input.bedrooms != null && Number(bedroomMatch[1]) !== input.bedrooms) {
    flags.push('SLUG_BEDROOMS_MISMATCH');
  }

  if (input.districtName) {
    const districtSlug = input.districtName
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '-');
    // Only meaningful when the slug names a district at all; some project slugs
    // are just the developer and the project name.
    if (/-en-[a-z-]+/.test(slug) && !slug.includes(districtSlug)) {
      flags.push('SLUG_DISTRICT_MISMATCH');
    }
  }

  return flags;
}

/** Flags that mean the row should be kept out of statistics and rankings. */
const DISQUALIFYING: ReadonlySet<QualityFlag> = new Set<QualityFlag>([
  'IMPLAUSIBLE_SALE_PRICE',
  'PROBABLY_RENT',
  'IMPLAUSIBLE_RENT',
  'PROBABLY_SALE',
  'IMPLAUSIBLE_AREA',
  'OUTLIER_PRICE_PER_M2',
  'MISSING_PRICE',
  'PRICE_IS_FROM',
]);

export function isUsableComparable(flags: readonly string[]): boolean {
  return !flags.some((flag) => DISQUALIFYING.has(flag as QualityFlag));
}
