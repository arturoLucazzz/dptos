/**
 * The row fields the Inicio client needs: what `recommend` sorts by plus what the
 * card and the table show. Everything else stays on the server.
 */

import type { DepartamentosRow } from './departamentos-query';
import { RECO_TABS, type RecoMode } from './home';
import { sourceBadges, type SourceBadge } from './source-badges';

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
  'paymentPen',
  'monthlyGainPen',
  'entryCostPen',
  'discountPct',
  'daysPublished',
  'locationScore',
  'locationReasons',
] as const;

export type HomeRow = Pick<DepartamentosRow, (typeof HOME_ROW_KEYS)[number]> & { sources: SourceBadge[] };

export function toHomeRow(row: DepartamentosRow): HomeRow {
  const out: Record<string, unknown> = {};
  for (const key of HOME_ROW_KEYS) out[key] = row[key];
  out.sources = sourceBadges(row.copies ?? []);
  return out as HomeRow;
}

export const RECO_FIRST = 16;
export const RECO_MAX = 200;

/** Read the tab (`orden`, or the older `mode`) and `n`; bad values fall back, n is capped. */
export function parseRecoParams(params: URLSearchParams): { mode: RecoMode; n: number } {
  const rawMode = params.get('orden') ?? params.get('mode');
  const mode = RECO_TABS.find((t) => t.mode === rawMode)?.mode ?? 'gain';
  const raw = Number(params.get('n'));
  const n = Number.isFinite(raw) && raw >= 1 ? Math.min(RECO_MAX, Math.round(raw)) : RECO_FIRST;
  return { mode, n };
}
