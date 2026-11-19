import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStatFiles, STATS_DIR } from './store';
import { latestStats } from './latest';
import { senseCheck } from './sense-check';
import { LIMA_DISTRICT_SLUGS } from '../../scraper/src/config/districts';

test('the committed statistics files load', () => {
  const rows = readStatFiles(STATS_DIR);
  const income = rows.filter((r) => r.indicator === 'high_income_pct');
  assert.equal(income.length, 43);
  assert.equal(income.find((r) => r.place === 'san-isidro')!.value, 100);
  assert.equal(income.find((r) => r.place === 'lince')!.value, 19.9);
});

test('every score indicator passes the sense check', () => {
  const latest = latestStats(readStatFiles(STATS_DIR));
  for (const [indicator, better] of [['high_income_pct', 'higher'], ['poverty_pct', 'lower']] as const) {
    assert.deepEqual(senseCheck(latest, indicator, better, LIMA_DISTRICT_SLUGS), { passed: true, failing: [] }, indicator);
  }
  assert.equal([...latest.values()].filter((m) => m.has('poverty_pct')).length, 43);
});
