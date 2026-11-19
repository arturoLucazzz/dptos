/**
 * Reads and checks the statistics files in data/stats/: the indicator catalog,
 * the non-district places (for example APEIM zones), and one data file per source.
 */

import { isLimaDistrict } from '../location/lima-districts';
import { csvLines, splitCsvLine } from './csv';

export const STAT_HEADER = 'place,indicator,value,period,source,source_ref';
export const INDICATORS_HEADER = 'indicator,label,unit,description';
export const PLACES_HEADER = 'place,kind,label,districts';

export type IndicatorDef = { indicator: string; label: string; unit: string; description: string };
export type PlaceDef = { place: string; kind: string; label: string; districts: string[] };
export type StatRow = {
  place: string;
  indicator: string;
  value: number;
  period: string;
  source: string;
  sourceRef: string;
  file: string;
};

const NUMBER = /^-?\d+(\.\d+)?$/;
/** A year, a month, or a window between two of them: 2020, 2025-10, 2024-11..2025-10. */
const PERIOD = /^\d{4}(-\d{2})?(\.\.\d{4}(-\d{2})?)?$/;

/** Data rows with their file row number (the header is row 1). Throws on a wrong header. */
function rowsOf(file: string, text: string, header: string): { cells: string[]; row: number }[] {
  const lines = csvLines(text);
  if (lines[0]?.trim() !== header) throw new Error(`Encabezado inválido en ${file}. Debe ser: ${header}`);
  return lines.slice(1).map((line, i) => ({ cells: splitCsvLine(line), row: i + 2 }));
}

export function parseIndicators(text: string): IndicatorDef[] {
  return rowsOf('indicators.csv', text, INDICATORS_HEADER).map(({ cells: [indicator, label, unit, description] }) => ({
    indicator,
    label,
    unit,
    description,
  }));
}

export function parsePlaces(text: string): PlaceDef[] {
  return rowsOf('places.csv', text, PLACES_HEADER).map(({ cells: [place, kind, label, districts], row }) => {
    const list = districts.split(';').map((d) => d.trim()).filter(Boolean);
    for (const d of list) if (!isLimaDistrict(d)) throw new Error(`Distrito desconocido en places.csv, fila ${row}: ${d}`);
    return { place, kind, label, districts: list };
  });
}

export function parseStatFile(file: string, text: string, ctx: { indicators: Set<string>; places: Set<string> }): StatRow[] {
  return rowsOf(file, text, STAT_HEADER).map(({ cells, row }) => {
    // An unquoted decimal or thousands comma ("12,5") adds a cell and shifts every column after it.
    if (cells.length !== 6) {
      throw new Error(`Fila con ${cells.length} columnas en ${file}, fila ${row} (deben ser 6). ¿Una coma decimal o de miles sin comillas? Usa punto decimal.`);
    }
    const [place, indicator, value, period, source, sourceRef] = cells;
    if (!isLimaDistrict(place) && !ctx.places.has(place)) throw new Error(`Lugar desconocido en ${file}, fila ${row}: ${place}`);
    if (!ctx.indicators.has(indicator)) {
      throw new Error(`Indicador desconocido en ${file}, fila ${row}: ${indicator} (agrégalo a indicators.csv)`);
    }
    if (!NUMBER.test(value)) {
      throw new Error(`Número inválido en ${file}, fila ${row}: ${value} (usa punto decimal y sin separador de miles)`);
    }
    if (!PERIOD.test(period)) throw new Error(`Periodo inválido en ${file}, fila ${row}: ${period} (usa 2020, 2025-10 o 2024-11..2025-10)`);
    if (!source) throw new Error(`Falta la fuente en ${file}, fila ${row}`);
    return { place, indicator, value: Number(value), period, source, sourceRef, file };
  });
}

/** Throws when two rows share place, indicator, and period, naming both files. */
export function checkUnique(rows: StatRow[]): void {
  const seen = new Map<string, StatRow>();
  for (const r of rows) {
    const key = `${r.place}\u0000${r.indicator}\u0000${r.period}`;
    const first = seen.get(key);
    if (first) throw new Error(`Dato repetido: ${r.place}, ${r.indicator}, ${r.period} en ${first.file} y ${r.file}`);
    seen.set(key, r);
  }
}
