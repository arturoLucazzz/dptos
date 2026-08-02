/**
 * Shared nuqs parsers for the departamentos page URL.
 * API route mirrors these names in parseDepartamentosSearchParams.
 */

import {
  parseAsArrayOf,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import { DEFAULT_PANEL } from './assumption-defaults';
import { DEPARTAMENTOS_SORT_IDS } from './departamentos-query';

export const departamentosSearchParams = {
  districts: parseAsArrayOf(parseAsString).withDefault([]),
  priceMin: parseAsFloat,
  priceMax: parseAsFloat,
  bedroomsMin: parseAsInteger,
  bedroomsMax: parseAsInteger,
  coverageMin: parseAsFloat,
  inicial: parseAsFloat.withDefault(DEFAULT_PANEL.downPaymentPct),
  tea: parseAsFloat.withDefault(DEFAULT_PANEL.tea),
  tcea: parseAsFloat.withDefault(DEFAULT_PANEL.tcea),
  plazo: parseAsInteger.withDefault(DEFAULT_PANEL.termYears),
  sort: parseAsStringLiteral(DEPARTAMENTOS_SORT_IDS).withDefault('coverage'),
  order: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
  page: parseAsInteger.withDefault(1),
};

/** Build the API query string from URL state (skip nulls / empty arrays). */
export function departamentosApiQuery(state: {
  districts: string[];
  priceMin: number | null;
  priceMax: number | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  coverageMin: number | null;
  inicial: number;
  tea: number;
  tcea: number;
  plazo: number;
  sort: string;
  order: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (state.districts.length > 0) params.set('districts', state.districts.join(','));
  if (state.priceMin != null) params.set('priceMin', String(state.priceMin));
  if (state.priceMax != null) params.set('priceMax', String(state.priceMax));
  if (state.bedroomsMin != null) params.set('bedroomsMin', String(state.bedroomsMin));
  if (state.bedroomsMax != null) params.set('bedroomsMax', String(state.bedroomsMax));
  if (state.coverageMin != null) params.set('coverageMin', String(state.coverageMin));
  params.set('inicial', String(state.inicial));
  params.set('tea', String(state.tea));
  params.set('tcea', String(state.tcea));
  params.set('plazo', String(state.plazo));
  params.set('sort', state.sort);
  params.set('order', state.order);
  params.set('page', String(state.page));
  return params.toString();
}
