/**
 * Shared nuqs parsers for the departamentos page URL.
 * API route mirrors these names in parseDepartamentosSearchParams.
 * The money assumptions are not here: they live in a cookie (lib/assumptions-cookie.ts).
 */

import {
  parseAsArrayOf,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import { DEPARTAMENTOS_SORT_IDS } from './departamentos-query';
import { SOURCE_IDS } from './listing-card';

export const departamentosSearchParams = {
  districts: parseAsArrayOf(parseAsString).withDefault([]),
  /** Source ids; unknown values are dropped by the literal parser. */
  fuentes: parseAsArrayOf(parseAsStringLiteral(SOURCE_IDS)).withDefault([]),
  priceMin: parseAsFloat,
  priceMax: parseAsFloat,
  bedroomsMin: parseAsInteger,
  bedroomsMax: parseAsInteger,
  coverageMin: parseAsFloat,
  /** Minimum location score, 0–10. */
  ubicacion: parseAsFloat,
  /**
   * Assumption overrides from old links, read-only: the settings window never writes
   * them. Absent means the cookie decides.
   */
  inicial: parseAsFloat,
  tea: parseAsFloat,
  tcea: parseAsFloat,
  plazo: parseAsInteger,
  efectivo: parseAsFloat,
  extra: parseAsFloat,
  sort: parseAsStringLiteral(DEPARTAMENTOS_SORT_IDS).withDefault('monthlyGain'),
  order: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
  page: parseAsInteger.withDefault(1),
};

/** Build the API query string from URL state (skip nulls / empty arrays). */
export function departamentosApiQuery(state: {
  districts: string[];
  fuentes: string[];
  priceMin: number | null;
  priceMax: number | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  coverageMin: number | null;
  ubicacion: number | null;
  inicial?: number | null;
  tea?: number | null;
  tcea?: number | null;
  plazo?: number | null;
  efectivo?: number | null;
  extra?: number | null;
  sort: string;
  order: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (state.districts.length > 0) params.set('districts', state.districts.join(','));
  if (state.fuentes.length > 0) params.set('fuentes', state.fuentes.join(','));
  if (state.priceMin != null) params.set('priceMin', String(state.priceMin));
  if (state.priceMax != null) params.set('priceMax', String(state.priceMax));
  if (state.bedroomsMin != null) params.set('bedroomsMin', String(state.bedroomsMin));
  if (state.bedroomsMax != null) params.set('bedroomsMax', String(state.bedroomsMax));
  if (state.coverageMin != null) params.set('coverageMin', String(state.coverageMin));
  if (state.ubicacion != null) params.set('ubicacion', String(state.ubicacion));
  if (state.inicial != null) params.set('inicial', String(state.inicial));
  if (state.tea != null) params.set('tea', String(state.tea));
  if (state.tcea != null) params.set('tcea', String(state.tcea));
  if (state.plazo != null) params.set('plazo', String(state.plazo));
  if (state.efectivo != null) params.set('efectivo', String(state.efectivo));
  if (state.extra != null) params.set('extra', String(state.extra));
  params.set('sort', state.sort);
  params.set('order', state.order);
  params.set('page', String(state.page));
  return params.toString();
}

/** The note shown when the page URL carries assumption overrides; null when it has none. */
export function urlOverrideNote(state: {
  inicial?: number | null;
  tea?: number | null;
  tcea?: number | null;
  plazo?: number | null;
  efectivo?: number | null;
  extra?: number | null;
}): string | null {
  const parts: string[] = [];
  if (state.tea != null) parts.push(`TEA ${state.tea}%`);
  if (state.tcea != null) parts.push(`TCEA ${state.tcea}%`);
  if (state.inicial != null) parts.push(`inicial ${state.inicial}%`);
  if (state.plazo != null) parts.push(`${state.plazo} años`);
  if (state.efectivo != null) parts.push(`efectivo S/ ${state.efectivo.toLocaleString('es-PE')}`);
  if (state.extra != null) parts.push(`extra S/ ${state.extra.toLocaleString('es-PE')}`);
  return parts.length > 0 ? `Esta página usa supuestos del enlace (${parts.join(', ')}).` : null;
}
