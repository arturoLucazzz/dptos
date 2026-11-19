import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStatFiles, STATS_DIR } from './store';
import { latestStats } from './latest';
import { senseCheck } from './sense-check';
import { LIMA_DISTRICT_SLUGS } from '../../scraper/src/config/districts';
import { SCORE_INDICATORS, SCORE_LEFT_OUT } from '../location/score';

test('the committed statistics files load', () => {
  const rows = readStatFiles(STATS_DIR);
  const income = rows.filter((r) => r.indicator === 'high_income_pct');
  assert.equal(income.length, 43);
  assert.equal(income.find((r) => r.place === 'san-isidro')!.value, 100);
  assert.equal(income.find((r) => r.place === 'lince')!.value, 19.9);
});

test('every score indicator passes the sense check', () => {
  const latest = latestStats(readStatFiles(STATS_DIR));
  const better = { high_income_pct: 'higher', poverty_pct: 'lower', complaints_per_10k: 'lower' } as const;
  for (const indicator of Object.values(SCORE_INDICATORS)) {
    const result = senseCheck(latest, indicator, better[indicator], LIMA_DISTRICT_SLUGS);
    // An indicator left out of the score must still fail; if new data passes, put it back in.
    assert.equal(result.passed, !SCORE_LEFT_OUT.has(indicator), `${indicator}: ${JSON.stringify(result)}`);
  }
  const count = (indicator: string) => [...latest.values()].filter((m) => m.has(indicator)).length;
  assert.equal(count('poverty_pct'), 43);
  assert.equal(count('population'), 43);
  assert.equal(count('complaints_per_10k'), 41); // Lima and San Juan de Lurigancho overflow ("#####") in the SIDPOL table
});
