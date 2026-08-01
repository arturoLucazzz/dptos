/**
 * Grouping listings into physical apartments.
 *
 * Urbania identifies the listing, not the apartment, so when a broker reposts,
 * the posting id changes. Without grouping, an apartment that sat on the market
 * for 46 days and dropped from 420,000 to 399,000 reappears as a brand new
 * listing at 415,000 with zero days of age, when in reality it is a seller who
 * cannot sell and is resetting the anchor. That is exactly the seller worth
 * finding.
 *
 * The same mechanism handles duplicates: one apartment listed by three brokers at
 * 399,000, 420,000 and 435,000 is a single property whose best live price is the
 * real negotiating anchor, and being multi-listed is itself a signal of urgency.
 *
 * The matching itself is deliberately conservative; see `propertyMatch` for why.
 */

/** Area rounded into buckets, so 64 m² and 65 m² can still be the same flat. */
export const AREA_BUCKET_M2 = 5;

const STREET_WORDS = [
  'avenida',
  'av',
  'calle',
  'ca',
  'jiron',
  'jr',
  'pasaje',
  'psje',
  'malecon',
  'alameda',
  'prolongacion',
  'urbanizacion',
  'urb',
  'esquina',
  'cuadra',
  'nro',
  'no',
  'num',
  'al',
];

/**
 * Normalize an address for comparison: no accents, no punctuation, no street-type
 * words, no filler. "Av. Arequipa al 1900" and "Avenida Arequipa 1900" collapse
 * to the same string.
 */
export function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STREET_WORDS.includes(token))
    .join(' ')
    .trim();
  return stripped || null;
}

export function areaBucket(area: number | null | undefined): number | null {
  if (area == null || !Number.isFinite(area) || area <= 0) return null;
  return Math.round(area / AREA_BUCKET_M2) * AREA_BUCKET_M2;
}

export interface FingerprintInput {
  districtSlug: string;
  address: string | null | undefined;
  bedrooms: number | null | undefined;
  area: number | null | undefined;
}

/**
 * Blocking key, not a decision. Listings that share it are candidates for being
 * the same apartment; whether they actually are is settled by scoring.
 */
export function propertyFingerprint(input: FingerprintInput): string {
  const parts = [
    input.districtSlug,
    normalizeAddress(input.address) ?? '?',
    input.bedrooms ?? '?',
    areaBucket(input.area) ?? '?',
  ];
  return parts.join('|');
}

/** Great-circle distance in metres. */
export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Share of tokens the two strings have in common, 0 to 1. */
function tokenOverlap(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  return shared / Math.min(setA.size, setB.size);
}

export interface MatchCandidate {
  districtSlug: string;
  addressNorm: string | null;
  bedrooms: number | null;
  /** Area of one of the candidate's listings, in m². */
  areaM2: number | null;
  latitude: number | null;
  longitude: number | null;
  /** Cheapest live asking price in soles among the candidate's listings. */
  pricePen: number | null;
}

export interface MatchSubject {
  districtSlug: string;
  addressNorm: string | null;
  bedrooms: number | null;
  area: number | null;
  latitude: number | null;
  longitude: number | null;
  pricePen: number | null;
}

/** Two brokers on one apartment quote within a few percent of each other. */
const SAME_PRICE_TOLERANCE = 0.05;
/** Areas are re-measured per listing, so allow a couple of m² of disagreement. */
const SAME_AREA_M2 = 2;
/** Beyond this the coordinates describe different buildings. */
const DIFFERENT_BUILDING_METRES = 150;
/** Share of address tokens two spellings of one address should have in common. */
const MIN_ADDRESS_OVERLAP = 0.75;

/** An address without a number identifies a street, not a door. */
function hasNumber(address: string): boolean {
  return /\d/.test(address);
}

function relativeGap(a: number, b: number): number {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  if (low <= 0) return Infinity;
  return (high - low) / low;
}

export interface MatchResult {
  /** Whether the two are the same physical apartment. */
  same: boolean;
  /** Only meaningful when `same`: higher wins among several matches. */
  closeness: number;
}

/**
 * Whether a candidate property is the same apartment as the listing being ingested.
 *
 * This is a conjunction of requirements rather than a score, because a score
 * cannot separate the two cases that matter, and they look nearly identical:
 *
 * - One apartment listed by three brokers. Same door, same area, prices within a
 *   few percent. This should be one property.
 * - A new building selling twelve 2-bedroom units of 52 to 59 m² at 494,000 to
 *   535,000, all with the street as their address and the same coordinates. These
 *   are twelve properties, and merging them deletes eleven real listings from
 *   every statistic that follows.
 *
 * A score model merges both, because every individual signal (same street, same
 * coordinates, same bedrooms, similar area, similar price) fires in both cases.
 * The one thing the second case cannot produce is a shared *specific* address, so
 * that is made mandatory: identical normalized address containing a number, which
 * is either the street number or the unit. Everything else can only disqualify.
 *
 * The bias is deliberate. Failing to merge leaves one apartment counted twice,
 * which shows up as a visible duplicate and is recoverable later. Merging wrongly
 * silently destroys observations, and nothing downstream can detect it.
 */
export function propertyMatch(subject: MatchSubject, candidate: MatchCandidate): MatchResult {
  const no: MatchResult = { same: false, closeness: 0 };

  if (subject.districtSlug !== candidate.districtSlug) return no;

  // The mandatory anchor: the same door, spelled the same way, with a number in it.
  if (!subject.addressNorm || !candidate.addressNorm) return no;
  if (!hasNumber(subject.addressNorm) || !hasNumber(candidate.addressNorm)) return no;
  if (
    subject.addressNorm !== candidate.addressNorm &&
    tokenOverlap(subject.addressNorm, candidate.addressNorm) < MIN_ADDRESS_OVERLAP
  ) {
    return no;
  }

  if (subject.bedrooms != null && candidate.bedrooms != null && subject.bedrooms !== candidate.bedrooms) {
    return no;
  }

  let areaGap = 0;
  if (subject.area != null && candidate.areaM2 != null) {
    areaGap = Math.abs(subject.area - candidate.areaM2);
    if (areaGap > SAME_AREA_M2) return no;
  }

  let priceGap = 0;
  if (subject.pricePen != null && candidate.pricePen != null) {
    priceGap = relativeGap(subject.pricePen, candidate.pricePen);
    if (priceGap > SAME_PRICE_TOLERANCE) return no;
  }

  if (
    subject.latitude != null &&
    subject.longitude != null &&
    candidate.latitude != null &&
    candidate.longitude != null
  ) {
    const metres = distanceMetres(
      { latitude: subject.latitude, longitude: subject.longitude },
      { latitude: candidate.latitude, longitude: candidate.longitude }
    );
    if (metres > DIFFERENT_BUILDING_METRES) return no;
  }

  // Among qualifying candidates, the closest price and area wins.
  return { same: true, closeness: 2 - priceGap / SAME_PRICE_TOLERANCE - areaGap / SAME_AREA_M2 };
}
