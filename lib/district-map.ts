/** Pure data for the /mercado district map: GeoJSON features with statistics and Ipsos zones. */

import type { IndicatorDef, PlaceDef } from './stats/files';
import type { LatestStat } from './stats/latest';

export type Ring = [number, number][];
type MultiPolygon = { type: 'MultiPolygon'; coordinates: Ring[][] };
type Feature<G, P> = { type: 'Feature'; properties: P; geometry: G };
export type FeatureCollection<G, P> = { type: 'FeatureCollection'; features: Feature<G, P>[] };
export type DistrictBoundary = { slug: string; name: string; rings: Ring[] };
export type LatestStats = Map<string, Map<string, LatestStat>>;

export const MAP_METRICS = [
  { key: 'zone_household_income_pen', label: 'Ingreso del hogar (zona Ipsos)' },
  { key: 'high_income_pct', label: 'Vecinos de ingreso alto' },
  { key: 'poverty_pct', label: 'Pobreza' },
  { key: 'complaints_per_10k', label: 'Denuncias por 10 mil habitantes' },
] as const;

export type MapMetricKey = (typeof MAP_METRICS)[number]['key'];

export type MapMetric = {
  key: MapMetricKey;
  label: string;
  unit: string | null;
  source: string | null;
  period: string | null;
};

/** The metrics with unit from the indicator catalog and source/period from the newest statistic row. */
export function mapMetrics(latest: LatestStats, indicators: IndicatorDef[]): MapMetric[] {
  return MAP_METRICS.map(({ key, label }) => {
    const unit = indicators.find((i) => i.indicator === key)?.unit ?? null;
    let found: LatestStat | null = null;
    for (const byIndicator of latest.values()) {
      const s = byIndicator.get(key);
      if (s && (!found || s.period > found.period)) found = s;
    }
    return { key, label, unit, source: found?.source ?? null, period: found?.period ?? null };
  });
}

export type DistrictProps = {
  slug: string;
  name: string;
  tracked: boolean;
  zone: string | null;
} & Record<MapMetricKey, number | null>;

export function buildDistrictFeatures(
  boundaries: DistrictBoundary[],
  latest: LatestStats,
  places: PlaceDef[],
  trackedSlugs: string[],
): FeatureCollection<MultiPolygon, DistrictProps> {
  const tracked = new Set(trackedSlugs);
  const zones = places.filter((p) => p.kind === 'zone');
  const features: Feature<MultiPolygon, DistrictProps>[] = [];
  for (const b of boundaries) {
    if (b.rings.length === 0) continue;
    const zone = zones.find((z) => z.districts.includes(b.slug)) ?? null;
    const props = { slug: b.slug, name: b.name, tracked: tracked.has(b.slug), zone: zone?.label ?? null } as DistrictProps;
    for (const { key } of MAP_METRICS) {
      // The zone income belongs to the Ipsos zone; the other metrics belong to the district itself.
      const place = key === 'zone_household_income_pen' ? zone?.place : b.slug;
      props[key] = place ? (latest.get(place)?.get(key)?.value ?? null) : null;
    }
    features.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'MultiPolygon', coordinates: b.rings.map((r) => [r]) },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Quantile breaks that ignore nulls: steps - 1 increasing cut values (fewer when values repeat). */
export function metricScale(values: (number | null)[], steps = 5): number[] {
  const sorted = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < steps; i++) {
    const pos = (i / steps) * (sorted.length - 1);
    const lo = Math.floor(pos);
    const v = sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
    if (breaks.length === 0 || v > breaks[breaks.length - 1]) breaks.push(v);
  }
  return breaks;
}

/** A copy of the districts with coordinates rounded (5 decimals is about 1 m), so less goes to the browser. */
export function roundCoordinates<P>(fc: FeatureCollection<MultiPolygon, P>, decimals = 5): FeatureCollection<MultiPolygon, P> {
  const k = 10 ** decimals;
  const r = (n: number) => Math.round(n * k) / k;
  return {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      geometry: { ...f.geometry, coordinates: f.geometry.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [r(x), r(y)] as [number, number]))) },
    })),
  };
}

/** A statistic for screen: "sin datos" for null (never 0), the number with its unit otherwise. */
export function formatMetricValue(value: number | null, unit: string | null): string {
  if (value === null) return 'sin datos';
  const n = value.toLocaleString('es-PE', { maximumFractionDigits: 1 });
  if (!unit) return n;
  if (unit.startsWith('S/')) return `S/ ${n}${unit.slice(2)}`;
  return `${n} ${unit}`;
}

const NSE_LEVELS = ['A', 'B', 'C', 'D', 'E'] as const;

/** Household share by socioeconomic level for Lima Metropolitana; empty when the data is not loaded. */
export function nseLima(latest: LatestStats): { level: (typeof NSE_LEVELS)[number]; pct: number }[] {
  const lima = latest.get('lima-metropolitana');
  const out: { level: (typeof NSE_LEVELS)[number]; pct: number }[] = [];
  for (const level of NSE_LEVELS) {
    const s = lima?.get(`nse_${level.toLowerCase()}_pct`);
    if (s) out.push({ level, pct: s.value });
  }
  return out;
}
