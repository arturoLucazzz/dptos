/**
 * Before an indicator enters the location score, it must rank the districts investors
 * know as the best in the better half: San Isidro, Miraflores, and San Borja each have
 * fewer than 6 of the 11 compared districts strictly better than them. A missing value fails.
 * (Better half, not better third: income strata top out at 100%, so ties push San Borja to 5th.)
 */

import type { LatestStat } from './latest';

const KNOWN_GOOD = ['san-isidro', 'miraflores', 'san-borja'] as const;
const MAX_BETTER = 5;

export function senseCheck(
  latest: Map<string, Map<string, LatestStat>>,
  indicator: string,
  better: 'higher' | 'lower',
  districts: readonly string[],
): { passed: boolean; failing: string[] } {
  const value = (d: string) => latest.get(d)?.get(indicator)?.value;
  const failing = KNOWN_GOOD.filter((d) => {
    const v = value(d);
    if (v == null) return true;
    const betterCount = districts.filter((o) => {
      const ov = value(o);
      return ov != null && (better === 'higher' ? ov > v : ov < v);
    }).length;
    return betterCount > MAX_BETTER;
  });
  return { passed: failing.length === 0, failing };
}
