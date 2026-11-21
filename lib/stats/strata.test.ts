import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseStrataRanges, STRATA, STRATA_RANGES_FILE } from './strata';
import { readStatFiles, STATS_DIR } from './store';

const rows = readStatFiles(STATS_DIR);
const byPlace = new Map<string, Map<string, number>>();
for (const r of rows) {
  const m = byPlace.get(r.place) ?? new Map<string, number>();
  m.set(r.indicator, r.value);
  byPlace.set(r.place, m);
}
const withStrata = [...byPlace].filter(([, m]) => STRATA.some((s) => m.has(`stratum_${s}_pct`)));

test('every district in the INEI file has strata', () => {
  const highIncome = [...byPlace].filter(([, m]) => m.has('high_income_pct')).map(([p]) => p).sort();
  assert.deepEqual(withStrata.map(([p]) => p).sort(), highIncome);
  assert.equal(withStrata.length, 43);
});

test('strata shares add up per district', () => {
  for (const [place, m] of withStrata) {
    const values = STRATA.map((s) => m.get(`stratum_${s}_pct`));
    assert.ok(values.every((v) => v != null), `${place} is missing a stratum`);
    const sum = values.reduce((a, b) => a! + b!, 0)!;
    assert.ok(sum >= 99 && sum <= 101, `${place} adds up to ${sum}`);
  }
});

test('alto matches high_income_pct', () => {
  for (const [place, m] of withStrata) {
    assert.ok(Math.abs(m.get('stratum_alto_pct')! - m.get('high_income_pct')!) <= 0.05, place);
  }
});

test('ranges cover the 5 strata', () => {
  const ranges = parseStrataRanges(readFileSync(join(STATS_DIR, STRATA_RANGES_FILE), 'utf8'));
  assert.deepEqual(ranges.map((r) => r.stratum), [...STRATA]);
  assert.deepEqual(ranges[0], { stratum: 'alto', minPen: 2412.45, maxPen: null });
  assert.deepEqual(ranges[4], { stratum: 'bajo', minPen: 0, maxPen: 863.71 });
  for (let i = 0; i < ranges.length - 1; i++) {
    assert.ok(ranges[i].minPen > ranges[i + 1].maxPen!, `${ranges[i].stratum} starts above ${ranges[i + 1].stratum}`);
  }
});

test('parseStrataRanges rejects a bad file', () => {
  assert.throws(() => parseStrataRanges('stratum,min_pen\nalto,1\n'), /encabezado/);
  assert.throws(() => parseStrataRanges('stratum,min_pen,max_pen,unit,source,source_ref\nraro,1,2,u,s,r\n'), /estrato/);
});
