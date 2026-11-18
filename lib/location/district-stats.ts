/**
 * Reads data/location/district-stats.csv: income per person (INEI) and police complaints
 * per 10,000 people per district, each with its source and date. Typed by hand from the
 * published reports; an empty cell means no free source gave the number.
 */

import { isLimaDistrict } from './lima-districts';
import type { DistrictStatInput } from './score';

export const DISTRICT_STATS_HEADER =
  'slug,income_per_capita_pen,income_source,income_date,complaints_per_10k,complaints_source,complaints_date';

export type DistrictStatRow = DistrictStatInput & {
  incomeSource: string | null;
  incomeDate: string | null;
  complaintsSource: string | null;
  complaintsDate: string | null;
};

/** One CSV line into cells, with double-quoted cells that may hold commas. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

export function parseDistrictStatsCsv(text: string): DistrictStatRow[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== DISTRICT_STATS_HEADER) {
    throw new Error(`El encabezado de district-stats.csv debe ser: ${DISTRICT_STATS_HEADER}`);
  }
  const rows: DistrictStatRow[] = [];
  lines.slice(1).forEach((line, index) => {
    if (line.trim() === '') return;
    const lineNumber = index + 2;
    const [slug, income, incomeSource, incomeDate, complaints, complaintsSource, complaintsDate] = splitCsvLine(line);
    if (!isLimaDistrict(slug)) throw new Error(`Distrito desconocido en district-stats.csv: ${slug}`);
    const num = (value: string | undefined): number | null => {
      if (!value) return null;
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Número inválido en district-stats.csv, fila ${lineNumber}: ${value}`);
      return n;
    };
    rows.push({
      slug,
      incomePerCapitaPen: num(income),
      incomeSource: incomeSource || null,
      incomeDate: incomeDate || null,
      complaintsPer10k: num(complaints),
      complaintsSource: complaintsSource || null,
      complaintsDate: complaintsDate || null,
    });
  });
  return rows;
}
