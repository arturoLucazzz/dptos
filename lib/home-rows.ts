/**
 * The row fields the Inicio client needs: what `recommend` sorts by plus what the
 * card and the table show. Everything else stays on the server.
 */

import type { DepartamentosRow } from './departamentos-query';

export const HOME_ROW_KEYS = [
  'postingId',
  'propertyId',
  'url',
  'imageUrl',
  'districtName',
  'bedrooms',
  'areaM2',
  'pricePen',
  'grossRentPen',
  'monthlyGainPen',
  'entryCostPen',
  'discountPct',
  'daysPublished',
  'locationScore',
  'locationReasons',
] as const;

export type HomeRow = Pick<DepartamentosRow, (typeof HOME_ROW_KEYS)[number]>;

export function toHomeRow(row: DepartamentosRow): HomeRow {
  const out: Record<string, unknown> = {};
  for (const key of HOME_ROW_KEYS) out[key] = row[key];
  return out as HomeRow;
}
