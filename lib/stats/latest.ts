/** The most recent value of each indicator per place. Older periods stay stored but unused. */

import type { StatRow } from './files';

export type LatestStat = { value: number; period: string; source: string };

/** The sortable end of a period: '2024-11..2025-10' ends at '2025-10'. */
export function periodEnd(period: string): string {
  return period.split('..').pop()!.trim();
}

/** The last four-digit year in a period, for screen text. */
export function periodYear(period: string): string {
  const years = period.match(/\d{4}/g);
  return years ? years[years.length - 1] : period;
}

export function latestStats(
  rows: Pick<StatRow, 'place' | 'indicator' | 'value' | 'period' | 'source'>[],
): Map<string, Map<string, LatestStat>> {
  const out = new Map<string, Map<string, LatestStat>>();
  for (const r of rows) {
    let byIndicator = out.get(r.place);
    if (!byIndicator) out.set(r.place, (byIndicator = new Map()));
    const current = byIndicator.get(r.indicator);
    if (!current || periodEnd(r.period) > periodEnd(current.period)) {
      byIndicator.set(r.indicator, { value: r.value, period: r.period, source: r.source });
    }
  }
  return out;
}
