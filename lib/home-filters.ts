/**
 * The Inicio filters as URL search parameters. One parser map serves the server page,
 * the recommendations API route and the client, so a link always means the same search.
 */

import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server';
import type { ListingFilterInput } from './departamentos-query';
import { RECO_TABS } from './home';
import { SOURCE_IDS } from './listing-card';

const RECO_MODES = RECO_TABS.map((t) => t.mode);

export const homeFilterParsers = {
  precio_min: parseAsInteger,
  precio_max: parseAsInteger,
  dorm_min: parseAsInteger,
  dorm_max: parseAsInteger,
  distrito: parseAsArrayOf(parseAsString),
  area_min: parseAsInteger,
  area_max: parseAsInteger,
  fuente: parseAsArrayOf(parseAsStringLiteral(SOURCE_IDS)),
  ubicacion_min: parseAsInteger,
  orden: parseAsStringLiteral(RECO_MODES).withDefault('gain'),
};

export type HomeFilters = inferParserType<typeof homeFilterParsers>;

export type HomeListingFilter = Required<
  Pick<
    ListingFilterInput,
    'districts' | 'sources' | 'priceMin' | 'priceMax' | 'bedroomsMin' | 'bedroomsMax' | 'areaM2Min' | 'areaM2Max' | 'locationMin'
  >
>;

export const loadHomeFilters = createLoader(homeFilterParsers);
export const serializeHomeFilters = createSerializer(homeFilterParsers);

function nonNegative(n: number | null): number | null {
  return n != null && n >= 0 ? n : null;
}

function ordered(lo: number | null, hi: number | null): [number | null, number | null] {
  return lo != null && hi != null && lo > hi ? [hi, lo] : [lo, hi];
}

/** The query input for queryDepartamentos: bad numbers and unknown districts are dropped, ranges put in order. */
export function toListingFilter(f: HomeFilters, knownDistricts: Set<string>): HomeListingFilter {
  const [priceMin, priceMax] = ordered(nonNegative(f.precio_min), nonNegative(f.precio_max));
  const [bedroomsMin, bedroomsMax] = ordered(nonNegative(f.dorm_min), nonNegative(f.dorm_max));
  const [areaM2Min, areaM2Max] = ordered(nonNegative(f.area_min), nonNegative(f.area_max));
  return {
    districts: (f.distrito ?? []).filter((d) => knownDistricts.has(d)),
    sources: f.fuente ?? [],
    priceMin,
    priceMax,
    bedroomsMin,
    bedroomsMax,
    areaM2Min,
    areaM2Max,
    locationMin: nonNegative(f.ubicacion_min),
  };
}

/** True when any filter is on; the tab (`orden`) is not a filter. */
export function hasActiveFilters(f: HomeFilters): boolean {
  return Object.entries(f).some(([key, value]) => key !== 'orden' && value != null && !(Array.isArray(value) && value.length === 0));
}
