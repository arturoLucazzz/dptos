/**
 * Pure helpers for the Inicio page: four market numbers and the recommendation lists.
 */

import type { DepartamentosRow } from './departamentos-query';
import { median } from './linalg';

export type HomeKpis = {
  typicalSalePen: number | null;
  typicalRentPen: number | null;
  grossYieldPct: number | null;
  saleCount: number;
};

export function homeKpis(
  sales: Pick<DepartamentosRow, 'pricePen' | 'grossRentPen'>[],
  rentPrices: number[],
): HomeKpis {
  const yields = sales.flatMap((r) =>
    r.grossRentPen != null && r.pricePen > 0 ? [((r.grossRentPen * 12) / r.pricePen) * 100] : [],
  );
  return {
    typicalSalePen: sales.length ? median(sales.map((r) => r.pricePen)) : null,
    typicalRentPen: rentPrices.length ? median(rentPrices) : null,
    grossYieldPct: yields.length ? Math.round(median(yields) * 10) / 10 : null,
    saleCount: sales.length,
  };
}

export type RecoMode = 'gain' | 'yield' | 'below' | 'location' | 'new';

export const RECO_TABS: { mode: RecoMode; label: string }[] = [
  { mode: 'gain', label: 'Mejor ganancia' },
  { mode: 'yield', label: 'Más rentables' },
  { mode: 'below', label: 'Bajo precio de mercado' },
  { mode: 'location', label: 'Mejor ubicación' },
  { mode: 'new', label: 'Nuevos' },
];

/** Sort value where bigger is better, or null when the row has none. */
function sortValue(row: DepartamentosRow, mode: RecoMode): number | null {
  switch (mode) {
    case 'gain':
      return row.monthlyGainPen;
    case 'yield':
      return row.grossRentPen != null && row.pricePen > 0
        ? ((row.grossRentPen * 12) / row.pricePen) * 100
        : null;
    case 'below':
      return row.discountPct;
    case 'location':
      return row.locationScore;
    case 'new':
      return row.daysPublished == null ? null : -row.daysPublished;
  }
}

export function recommend(
  rows: DepartamentosRow[],
  mode: RecoMode,
  n: number,
): { rows: DepartamentosRow[]; hasMore: boolean } {
  const keyed = rows.map((row) => ({ row, key: sortValue(row, mode) }));
  keyed.sort((a, b) => {
    if (a.key == null && b.key != null) return 1;
    if (a.key != null && b.key == null) return -1;
    if (a.key != null && b.key != null && a.key !== b.key) return b.key - a.key;
    return a.row.postingId < b.row.postingId ? -1 : a.row.postingId > b.row.postingId ? 1 : 0;
  });
  return { rows: keyed.slice(0, n).map((k) => k.row), hasMore: keyed.length > n };
}

export function moneyLine(gainPen: number | null): { text: string; tone: 'gain' | 'loss' } | null {
  if (gainPen == null) return null;
  const whole = Math.round(gainPen);
  if (whole >= 0) return { text: `Ganas S/ ${whole.toLocaleString('es-PE')}/mes`, tone: 'gain' };
  return { text: `Pones S/ ${Math.abs(whole).toLocaleString('es-PE')}/mes`, tone: 'loss' };
}
