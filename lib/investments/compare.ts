/**
 * The Comparar table and the Excel rows for an inversión. Pure: the numbers come from
 * the pick rows and the shared helpers; nothing is recomputed here beyond the two ratios.
 */

import { grossYieldPct, pricePerM2 } from '../gross-yield';
import type { PickView } from './pick-view';

/** `lastKnown`: shown for a pick outside the analysis too (its last price, its size); it still never wins. */
export type CompareRow = {
  label: string;
  wins: 'lower' | 'higher';
  value: (p: PickView) => number | null;
  format: (n: number) => string;
  lastKnown?: boolean;
};

const pen = (n: number) => `S/ ${Math.round(n).toLocaleString('es-PE')}`;
const signedPen = (n: number) => `${n < 0 ? '-' : '+'}${pen(Math.abs(n))}`;

export const COMPARE_ROWS: CompareRow[] = [
  { label: 'Precio', wins: 'lower', value: (p) => p.pricePen, format: pen, lastKnown: true },
  { label: 'Precio por m²', wins: 'lower', value: (p) => pricePerM2(p.row?.pricePen ?? null, p.row?.areaM2 ?? null), format: pen },
  { label: 'Área', wins: 'higher', value: (p) => p.row?.areaM2 ?? p.areaM2, format: (n) => `${n} m²`, lastKnown: true },
  { label: 'Alquiler estimado', wins: 'higher', value: (p) => p.row?.grossRentPen ?? null, format: pen },
  { label: 'Cuota del banco', wins: 'lower', value: (p) => p.row?.paymentPen ?? null, format: pen },
  { label: 'Ganancia mensual', wins: 'higher', value: (p) => p.row?.monthlyGainPen ?? null, format: signedPen },
  { label: 'Rentabilidad bruta', wins: 'higher', value: (p) => (p.row ? grossYieldPct(p.row.grossRentPen, p.row.pricePen) : null), format: (n) => `${n.toFixed(1)}%` },
  { label: 'Efectivo día 1', wins: 'lower', value: (p) => p.row?.entryCostPen ?? null, format: pen },
  { label: 'Ubicación', wins: 'higher', value: (p) => p.row?.locationScore ?? null, format: (n) => n.toFixed(1) },
];

/** The cell value: a gone pick keeps only the last known rows. Null when there is no finite number. */
function cellValue(def: CompareRow, p: PickView): number | null {
  const v = p.gone && !def.lastKnown ? null : def.value(p);
  return v != null && Number.isFinite(v) ? v : null;
}

export function buildCompareTable(picks: PickView[]): { label: string; cells: { text: string; best: boolean }[] }[] {
  return COMPARE_ROWS.map((def) => {
    const values = picks.map((p) => cellValue(def, p));
    // Only picks in the analysis compete for the best cell.
    const present = values.filter((v, i): v is number => v != null && !picks[i].gone);
    const target = present.length === 0 ? null : def.wins === 'lower' ? Math.min(...present) : Math.max(...present);
    return {
      label: def.label,
      cells: values.map((v, i) => ({
        text: v == null ? '-' : def.format(v),
        best: present.length >= 2 && v != null && !picks[i].gone && v === target,
      })),
    };
  });
}

/** A file name safe to download: slashes and quotes out, accents kept, `.xlsx` added. */
export function excelFileName(name: string): string {
  const clean = name
    .replace(/\s*[\\/:]\s*/g, ' - ')
    .replace(/["*?<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return `${clean || 'inversion'}.xlsx`;
}

const MONEY_FMT = '"S/" #,##0';
/** Number format per Excel column, by header. Rentabilidad keeps the percent number (7.2), shown as 7.2%. */
export const EXCEL_NUM_FMT: Record<string, string> = {
  Precio: MONEY_FMT,
  'Precio por m²': MONEY_FMT,
  Área: '0 "m²"',
  'Alquiler estimado': MONEY_FMT,
  'Cuota del banco': MONEY_FMT,
  'Ganancia mensual': MONEY_FMT,
  'Rentabilidad bruta': '0.0"%"',
  'Efectivo día 1': MONEY_FMT,
  Ubicación: '0.0',
};

export const EXCEL_WIDTHS: Record<string, number> = { Propiedad: 28, Distrito: 16, Estado: 20, Nota: 36, Enlace: 50 };

export function buildExcelRows(picks: PickView[]): (string | number | null)[][] {
  const header = ['Propiedad', 'Distrito', 'Estado', ...COMPARE_ROWS.map((r) => r.label), 'Nota', 'Enlace'];
  const rows = picks.map((p) => [
    p.title,
    p.districtName || null,
    p.statusLabel,
    ...COMPARE_ROWS.map((r) => cellValue(r, p)),
    p.note,
    p.url,
  ]);
  return [header, ...rows];
}
