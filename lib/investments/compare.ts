/**
 * The Comparar table and the Excel rows for an inversión. Pure: the numbers come from
 * the pick rows and the shared helpers; nothing is recomputed here beyond the two ratios.
 */

import { grossYieldPct, pricePerM2 } from '../gross-yield';
import type { PickView } from './pick-view';

export type CompareRow = { label: string; wins: 'lower' | 'higher'; value: (p: PickView) => number | null; format: (n: number) => string };

const pen = (n: number) => `S/ ${Math.round(n).toLocaleString('es-PE')}`;
const signedPen = (n: number) => `${n < 0 ? '-' : '+'}${pen(Math.abs(n))}`;

export const COMPARE_ROWS: CompareRow[] = [
  { label: 'Precio', wins: 'lower', value: (p) => p.pricePen, format: pen },
  { label: 'Precio por m²', wins: 'lower', value: (p) => pricePerM2(p.row?.pricePen ?? null, p.row?.areaM2 ?? null), format: pen },
  { label: 'Área', wins: 'higher', value: (p) => p.row?.areaM2 ?? null, format: (n) => `${n} m²` },
  { label: 'Alquiler estimado', wins: 'higher', value: (p) => p.row?.grossRentPen ?? null, format: pen },
  { label: 'Cuota del banco', wins: 'lower', value: (p) => p.row?.paymentPen ?? null, format: pen },
  { label: 'Ganancia mensual', wins: 'higher', value: (p) => p.row?.monthlyGainPen ?? null, format: signedPen },
  { label: 'Rentabilidad bruta', wins: 'higher', value: (p) => (p.row ? grossYieldPct(p.row.grossRentPen, p.row.pricePen) : null), format: (n) => `${n.toFixed(1)}%` },
  { label: 'Efectivo día 1', wins: 'lower', value: (p) => p.row?.entryCostPen ?? null, format: pen },
  { label: 'Ubicación', wins: 'higher', value: (p) => p.row?.locationScore ?? null, format: (n) => n.toFixed(1) },
];

export function buildCompareTable(picks: PickView[]): { label: string; cells: { text: string; best: boolean }[] }[] {
  return COMPARE_ROWS.map((def) => {
    const values = picks.map((p) => {
      const v = p.gone ? null : def.value(p);
      return v != null && Number.isFinite(v) ? v : null;
    });
    const present = values.filter((v): v is number => v != null);
    const target = present.length === 0 ? null : def.wins === 'lower' ? Math.min(...present) : Math.max(...present);
    return {
      label: def.label,
      cells: values.map((v) => ({ text: v == null ? '-' : def.format(v), best: v != null && v === target })),
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

export function buildExcelRows(picks: PickView[]): (string | number | null)[][] {
  const header = ['Propiedad', 'Distrito', ...COMPARE_ROWS.map((r) => r.label), 'Nota', 'Enlace'];
  const rows = picks.map((p) => [
    p.title,
    p.districtName || null,
    ...COMPARE_ROWS.map((r) => {
      const v = p.gone ? null : r.value(p);
      return v != null && Number.isFinite(v) ? v : null;
    }),
    p.note,
    p.url,
  ]);
  return [header, ...rows];
}
