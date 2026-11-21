/** INEI 2020 income strata: the five levels and the income range of each, for the district panel. */

import { csvLines, splitCsvLine } from './csv';

export const STRATA = ['alto', 'medio_alto', 'medio', 'medio_bajo', 'bajo'] as const;
export type Stratum = (typeof STRATA)[number];
export type StratumRange = { stratum: Stratum; minPen: number; maxPen: number | null };

export const STRATA_RANGES_FILE = 'inei-estratos-2020-rangos.csv';
const HEADER = 'stratum,min_pen,max_pen,unit,source,source_ref';

/** The ranges file, in STRATA order; a bad header, stratum or number throws a Spanish error. */
export function parseStrataRanges(text: string): StratumRange[] {
  const [header, ...lines] = csvLines(text);
  if (header !== HEADER) throw new Error(`${STRATA_RANGES_FILE}: el encabezado debe ser ${HEADER}`);
  const out = lines.map((line, i) => {
    const [stratum, min, max] = splitCsvLine(line);
    if (!(STRATA as readonly string[]).includes(stratum)) throw new Error(`${STRATA_RANGES_FILE}, fila ${i + 2}: estrato desconocido ${stratum}`);
    const minPen = Number(min);
    const maxPen = max === '' ? null : Number(max);
    if (!Number.isFinite(minPen) || (maxPen != null && !Number.isFinite(maxPen))) {
      throw new Error(`${STRATA_RANGES_FILE}, fila ${i + 2}: número inválido`);
    }
    return { stratum: stratum as Stratum, minPen, maxPen };
  });
  return out.sort((a, b) => STRATA.indexOf(a.stratum) - STRATA.indexOf(b.stratum));
}
