/**
 * The location score: half livability (owner zones plus nearby places), half tenant
 * demand (rent listings nearby, how fast they go, and district statistics: income strata,
 * poverty, and police complaints).
 * Every part is a percentile among the tracked apartments, so 10 is the best tracked spot.
 */

import { GridIndex, type LatLon } from './geo';
import { isLimaDistrict } from './lima-districts';
import { localRent, type LocalRent, type RentPoint } from './local-rent';
import { pickZone, type ZoneShape } from './zones';
import { mean, median } from '../linalg';
import { periodYear } from '../stats/latest';

export type PlaceCategory = 'food' | 'park' | 'shop' | 'services' | 'transit';
export const PLACE_CATEGORIES: readonly PlaceCategory[] = ['food', 'park', 'shop', 'services', 'transit'];
export type PlacePoint = LatLon & { category: PlaceCategory };
export type StatValue = { value: number; period: string };
/**
 * The latest district statistics the score reads, from the Statistic table.
 * null: the indicator is used but this district has no value ("Sin datos ..." reason).
 * undefined: the indicator is left out of the score (no signal, no reason).
 */
export type DistrictStatInput = {
  slug: string;
  highIncomePct?: StatValue | null;
  povertyPct?: StatValue | null;
  complaintsPer10k?: StatValue | null;
};
/** The Statistic indicators behind DistrictStatInput. */
export const SCORE_INDICATORS = { highIncome: 'high_income_pct', poverty: 'poverty_pct', complaints: 'complaints_per_10k' } as const;
/**
 * Indicators that failed the sense check (lib/stats/sense-check.ts) and stay context only.
 * Complaints per resident rank San Isidro and Miraflores 9th and 10th of 11: shoppers and
 * office workers file complaints there, so the count says little about living there.
 */
export const SCORE_LEFT_OUT: ReadonlySet<string> = new Set([SCORE_INDICATORS.complaints]);
/** daysOnline is set only for gone listings seen in the last 180 days. */
export type RentActivityPoint = LatLon & { live: boolean; daysOnline: number | null };
export type ScoreSubject = { propertyId: string; districtSlug: string; lat: number | null; lon: number | null; bedrooms: number | null };
export type LocationReason = { tone: 'up' | 'down' | 'info'; text: string };
export type LocationStatusValue = 'OK' | 'OUTSIDE_LIMA' | 'NO_COORDINATES';
export type LocationResult = {
  propertyId: string;
  status: LocationStatusValue;
  score: number | null;
  livability: number | null;
  demand: number | null;
  reasons: LocationReason[];
  localRent: LocalRent | null;
};

export const LIVABILITY_RADIUS_M = 500;
export const DEMAND_RADIUS_M = 1_000;
export const ZONE_MAX_WEIGHT = 0.6;
const MIN_GONE_FOR_SPEED = 5;
const HIGH = 6.5;
const LOW = 3.5;

/** (below + 0.5 × equal) / n × 10. */
export function percentileScore(values: readonly number[], v: number): number {
  if (values.length === 0) return NaN;
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return ((below + 0.5 * equal) / values.length) * 10;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

interface Raw {
  subject: ScoreSubject & LatLon;
  counts: Record<PlaceCategory, number>;
  zone: ReturnType<typeof pickZone>;
  liveRents: number;
  medianDays: number | null;
  income: StatValue | null | undefined;
  poverty: StatValue | null | undefined;
  complaints: StatValue | null | undefined;
  localRent: LocalRent | null;
}

function zoneTone(rating: number): LocationReason['tone'] {
  if (rating >= 6) return 'up';
  if (rating <= 4) return 'down';
  return 'info';
}

export function scoreAll(input: {
  subjects: ScoreSubject[];
  places: PlacePoint[];
  zones: ZoneShape[];
  districtStats: DistrictStatInput[];
  rentActivity: RentActivityPoint[];
  rents: RentPoint[];
}): LocationResult[] {
  const places = new GridIndex(input.places);
  const activity = new GridIndex(input.rentActivity);
  const rents = new GridIndex(input.rents);
  const stats = new Map(input.districtStats.map((s) => [s.slug, s]));
  const anyLiveRent = input.rentActivity.some((a) => a.live);
  const anyPlaces = input.places.length > 0;

  const raws: Raw[] = [];
  const results = new Map<string, LocationResult>();
  for (const s of input.subjects) {
    const status: LocationStatusValue = !isLimaDistrict(s.districtSlug)
      ? 'OUTSIDE_LIMA'
      : s.lat == null || s.lon == null
        ? 'NO_COORDINATES'
        : 'OK';
    if (status !== 'OK' || s.lat == null || s.lon == null) {
      results.set(s.propertyId, { propertyId: s.propertyId, status, score: null, livability: null, demand: null, reasons: [], localRent: null });
      continue;
    }
    const p = { lat: s.lat, lon: s.lon };
    const counts = { food: 0, park: 0, shop: 0, services: 0, transit: 0 };
    for (const { item } of places.near(p, LIVABILITY_RADIUS_M)) counts[item.category]++;
    const nearActivity = activity.near(p, DEMAND_RADIUS_M).map((f) => f.item);
    const goneDays = nearActivity.flatMap((a) => (!a.live && a.daysOnline != null ? [a.daysOnline] : []));
    const stat = stats.get(s.districtSlug);
    raws.push({
      subject: { ...s, ...p },
      counts,
      zone: pickZone(p, input.zones),
      liveRents: nearActivity.filter((a) => a.live).length,
      medianDays: goneDays.length >= MIN_GONE_FOR_SPEED ? median(goneDays) : null,
      income: stat ? stat.highIncomePct : null,
      poverty: stat ? stat.povertyPct : null,
      complaints: stat ? stat.complaintsPer10k : null,
      localRent: localRent({ ...p, bedrooms: s.bedrooms }, rents),
    });
  }

  const categoryValues = Object.fromEntries(PLACE_CATEGORIES.map((c) => [c, raws.map((r) => r.counts[c])])) as Record<PlaceCategory, number[]>;
  const liveValues = raws.map((r) => r.liveRents);
  const dayValues = raws.flatMap((r) => (r.medianDays == null ? [] : [r.medianDays]));
  const incomeValues = raws.flatMap((r) => (r.income == null ? [] : [r.income.value]));
  const povertyValues = raws.flatMap((r) => (r.poverty == null ? [] : [r.poverty.value]));
  const complaintValues = raws.flatMap((r) => (r.complaints == null ? [] : [r.complaints.value]));

  for (const r of raws) {
    const reasons: LocationReason[] = [];
    // No Place rows at all (location:places never ran): every count would tie at 5,
    // a plausible-looking number built on nothing, so the place part is left out.
    const placePart = anyPlaces ? mean(PLACE_CATEGORIES.map((c) => percentileScore(categoryValues[c], r.counts[c]))) : null;
    let livability: number | null = placePart;
    if (r.zone) {
      const w = ZONE_MAX_WEIGHT * r.zone.reach;
      livability = placePart == null ? r.zone.zone.rating : w * r.zone.zone.rating + (1 - w) * placePart;
      const { name, rating } = r.zone.zone;
      const text =
        r.zone.distanceToEdgeM === 0
          ? `Dentro de ${name} (tu zona, ${rating}/10)`
          : `Cerca de ${name} (tu zona, ${rating}/10), a ${Math.round(r.zone.distanceToEdgeM / 10) * 10} m`;
      reasons.push({ tone: zoneTone(rating), text });
    }
    reasons.push(
      anyPlaces
        ? { tone: 'info', text: `${r.counts.food} restaurantes y ${r.counts.park} parques a menos de 500 m` }
        : { tone: 'info', text: 'Sin datos de lugares (corre pnpm location:places)' },
    );

    const signals: number[] = [];
    // With no live rent listing anywhere, the count says nothing; leave it out.
    if (anyLiveRent) signals.push(percentileScore(liveValues, r.liveRents));
    if (r.medianDays != null) {
      const speed = 10 - percentileScore(dayValues, r.medianDays);
      signals.push(speed);
      const d = Math.round(r.medianDays);
      if (speed >= HIGH) reasons.push({ tone: 'up', text: `Los alquileres cercanos se van rápido (mediana ${d} días)` });
      else if (speed <= LOW) reasons.push({ tone: 'down', text: `Los alquileres cercanos tardan en irse (mediana ${d} días)` });
    } else {
      reasons.push({ tone: 'info', text: 'Pocos alquileres cercanos para medir la demanda' });
    }
    if (r.income === undefined) {
      // Left out of the score.
    } else if (r.income !== null) {
      const income = percentileScore(incomeValues, r.income.value);
      signals.push(income);
      const tone = income >= HIGH ? 'up' : income <= LOW ? 'down' : 'info';
      reasons.push({ tone, text: `${Math.round(r.income.value)}% vive en manzanas de ingreso alto (INEI ${periodYear(r.income.period)})` });
    } else {
      reasons.push({ tone: 'info', text: 'Sin datos de ingresos para este distrito' });
    }
    if (r.poverty === undefined) {
      // Left out of the score.
    } else if (r.poverty !== null) {
      const lowPoverty = 10 - percentileScore(povertyValues, r.poverty.value);
      signals.push(lowPoverty);
      const year = periodYear(r.poverty.period);
      if (lowPoverty >= HIGH) reasons.push({ tone: 'up', text: `Pobreza baja en el distrito (INEI ${year})` });
      else if (lowPoverty <= LOW) reasons.push({ tone: 'down', text: `Pobreza alta en el distrito (INEI ${year})` });
    } else {
      reasons.push({ tone: 'info', text: 'Sin datos de pobreza para este distrito' });
    }
    if (r.complaints === undefined) {
      // Left out of the score.
    } else if (r.complaints !== null) {
      const safety = 10 - percentileScore(complaintValues, r.complaints.value);
      signals.push(safety);
      const year = periodYear(r.complaints.period);
      if (safety >= HIGH) reasons.push({ tone: 'up', text: `Pocas denuncias en el distrito (SIDPOL ${year})` });
      else if (safety <= LOW) reasons.push({ tone: 'down', text: `Muchas denuncias en el distrito (SIDPOL ${year})` });
    } else {
      reasons.push({ tone: 'info', text: 'Sin datos de delitos para este distrito' });
    }

    const demand = signals.length > 0 ? mean(signals) : null;
    const score =
      livability != null && demand != null ? 0.5 * livability + 0.5 * demand : (livability ?? demand);
    results.set(r.subject.propertyId, {
      propertyId: r.subject.propertyId,
      status: 'OK',
      score: score == null ? null : round1(score),
      livability: livability == null ? null : round1(livability),
      demand: demand == null ? null : round1(demand),
      reasons,
      localRent: r.localRent,
    });
  }

  return input.subjects.map((s) => results.get(s.propertyId)!);
}
