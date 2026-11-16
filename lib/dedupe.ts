/**
 * Cross-source dedupe rules. Pure functions, no database.
 *
 * A wrong merge silently removes a real listing from every statistic, so every
 * rule that is unsure returns MEDIUM, LOW or null, never HIGH. HIGH is reserved
 * for pairs that share something a different apartment cannot share.
 */

import { distanceMetres, normalizeAddress, propertyMatch } from './fingerprint';
import type { SourceId } from './listing-card';

export type DuplicateLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DedupeSide {
  id: string;
  sources: SourceId[];
  districtSlug: string;
  addressNorm: string | null;
  streetNorm: string | null;
  buildingNorm: string | null;
  unitNumber: string | null;
  developerNorm: string | null;
  titleNorm: string | null;
  bedrooms: number | null;
  areaM2: number | null;
  latitude: number | null;
  longitude: number | null;
  pricePen: number | null;
}

export interface PairResult {
  level: DuplicateLevel | null;
  signals: string[];
  closeness: number;
}

const NAVENT_AREA_M2 = 0.5;
const MEDIUM_AREA_M2 = 2;
const LOW_AREA_M2 = 5;
const MAX_PRICE_GAP = 0.1;
const MEDIUM_DISTANCE_METRES = 150;

/** The normalized address without the tokens that contain a digit. */
export function streetNorm(address: string | null | undefined): string | null {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  const street = normalized
    .split(' ')
    .filter((token) => token !== '' && !/\d/.test(token))
    .join(' ');
  return street || null;
}

const NAME_NOISE_WORDS = ['edificio', 'residencial', 'proyecto', 'condominio', 'torre'];

/** Building, developer and title names: lowercase, no accents, no punctuation, no noise words. */
export function nameNorm(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token !== '' && !NAME_NOISE_WORDS.includes(token))
    .join(' ');
  return cleaned || null;
}

export function pairKey(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

/** Relative gap |a-b| / min(a,b); null when either price is missing or not positive. */
function priceGap(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  const low = Math.min(a, b);
  if (low <= 0) return null;
  return Math.abs(a - b) / low;
}

/** Whether the digit-containing tokens (street number, dpto, unit) of two addresses are the same set. */
function sameNumberTokens(a: string | null, b: string | null): boolean {
  const numbers = (value: string | null) =>
    new Set((value ?? '').split(' ').filter((token) => /\d/.test(token)));
  const setA = numbers(a);
  const setB = numbers(b);
  return setA.size === setB.size && [...setA].every((token) => setB.has(token));
}

function equalNonNull<T>(a: T | null, b: T | null): boolean {
  return a != null && b != null && a === b;
}

function areaWithin(a: number | null, b: number | null, limit: number): boolean {
  return a != null && b != null && Math.abs(a - b) <= limit;
}

function high(signal: string, gap: number | null): PairResult {
  return { level: 'HIGH', signals: [signal], closeness: gap == null ? 0 : Math.min(1, Math.max(0, 1 - gap)) };
}

export function classifyPair(subject: DedupeSide, candidate: DedupeSide): PairResult {
  const none: PairResult = { level: null, signals: [], closeness: 0 };

  if (subject.districtSlug !== candidate.districtSlug) return none;
  // Two different unit numbers are two different apartments, whatever else matches.
  if (subject.unitNumber != null && candidate.unitNumber != null && subject.unitNumber !== candidate.unitNumber) {
    return none;
  }

  const gap = priceGap(subject.pricePen, candidate.pricePen);

  // HIGH: the same posting copied between the two Navent portals.
  const crossNavent =
    (subject.sources.includes('urbania') && candidate.sources.includes('adondevivir')) ||
    (subject.sources.includes('adondevivir') && candidate.sources.includes('urbania'));
  if (
    crossNavent &&
    equalNonNull(subject.titleNorm, candidate.titleNorm) &&
    subject.pricePen != null &&
    candidate.pricePen != null &&
    Math.abs(subject.pricePen - candidate.pricePen) < 1 &&
    areaWithin(subject.areaM2, candidate.areaM2, NAVENT_AREA_M2) &&
    subject.addressNorm === candidate.addressNorm
  ) {
    return high('navent-copy', gap);
  }

  // HIGH: same door, decided by the existing conservative matcher.
  const door = propertyMatch(
    {
      districtSlug: subject.districtSlug,
      addressNorm: subject.addressNorm,
      bedrooms: subject.bedrooms,
      area: subject.areaM2,
      latitude: subject.latitude,
      longitude: subject.longitude,
      pricePen: subject.pricePen,
    },
    {
      districtSlug: candidate.districtSlug,
      addressNorm: candidate.addressNorm,
      bedrooms: candidate.bedrooms,
      areaM2: candidate.areaM2,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      pricePen: candidate.pricePen,
    }
  );
  // propertyMatch lets every null pass and accepts 75% token overlap, so
  // require both areas and prices, and the same door and unit numbers.
  if (
    door.same &&
    subject.areaM2 != null &&
    candidate.areaM2 != null &&
    subject.pricePen != null &&
    candidate.pricePen != null &&
    sameNumberTokens(subject.addressNorm, candidate.addressNorm)
  ) {
    return high('same-door', gap);
  }

  // HIGH: same building and same unit number.
  if (
    equalNonNull(subject.buildingNorm, candidate.buildingNorm) &&
    equalNonNull(subject.unitNumber, candidate.unitNumber) &&
    (subject.bedrooms == null || candidate.bedrooms == null || subject.bedrooms === candidate.bedrooms) &&
    (subject.areaM2 == null || candidate.areaM2 == null || areaWithin(subject.areaM2, candidate.areaM2, MEDIUM_AREA_M2)) &&
    (gap == null || gap <= MAX_PRICE_GAP)
  ) {
    return high('same-unit', gap);
  }

  // MEDIUM and LOW need bedrooms, a price gap and areas on both sides.
  if (gap == null || gap > MAX_PRICE_GAP) return none;
  if (!equalNonNull(subject.bedrooms, candidate.bedrooms)) return none;

  const buildingMatch = equalNonNull(subject.buildingNorm, candidate.buildingNorm);
  const developerMatch = equalNonNull(subject.developerNorm, candidate.developerNorm);
  if (
    (buildingMatch || developerMatch) &&
    areaWithin(subject.areaM2, candidate.areaM2, MEDIUM_AREA_M2)
  ) {
    const bothCoords =
      subject.latitude != null &&
      subject.longitude != null &&
      candidate.latitude != null &&
      candidate.longitude != null;
    const near =
      !bothCoords ||
      distanceMetres(
        { latitude: subject.latitude as number, longitude: subject.longitude as number },
        { latitude: candidate.latitude as number, longitude: candidate.longitude as number }
      ) <= MEDIUM_DISTANCE_METRES;
    if (near) {
      return { level: 'MEDIUM', signals: [buildingMatch ? 'same-building' : 'same-developer'], closeness: 0 };
    }
  }

  if (
    equalNonNull(subject.streetNorm, candidate.streetNorm) &&
    areaWithin(subject.areaM2, candidate.areaM2, LOW_AREA_M2)
  ) {
    return { level: 'LOW', signals: ['same-street'], closeness: 0 };
  }

  return none;
}

export interface PropertyDecision {
  attachTo: string | null;
  flags: { propertyId: string; level: 'MEDIUM' | 'LOW'; signals: string[] }[];
}

/** Attach to the closest HIGH candidate; with none, flag every MEDIUM and LOW one. */
export function decideProperty(subject: DedupeSide, candidates: DedupeSide[]): PropertyDecision {
  let best: { id: string; closeness: number } | null = null;
  const flags: PropertyDecision['flags'] = [];

  for (const candidate of candidates) {
    const result = classifyPair(subject, candidate);
    if (result.level === 'HIGH') {
      if (best == null || result.closeness > best.closeness) {
        best = { id: candidate.id, closeness: result.closeness };
      }
    } else if (result.level != null) {
      flags.push({ propertyId: candidate.id, level: result.level, signals: result.signals });
    }
  }

  if (best) return { attachTo: best.id, flags: [] };
  return { attachTo: null, flags };
}
