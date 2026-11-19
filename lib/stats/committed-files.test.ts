import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { readStatFiles, STATS_DIR } from './store';
import { latestStats } from './latest';
import { senseCheck } from './sense-check';
import { parsePlaces } from './files';
import { LIMA_PROVINCE_DISTRICTS } from '../location/lima-districts';
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

test('the NSE levels of each place add up to about 100%', () => {
  const rows = readStatFiles(STATS_DIR).filter((r) => r.indicator.startsWith('nse_'));
  const byPlace = new Map<string, typeof rows>();
  for (const r of rows) byPlace.set(`${r.place} ${r.period}`, [...(byPlace.get(`${r.place} ${r.period}`) ?? []), r]);
  assert.ok(byPlace.size >= 1);
  for (const [place, pr] of byPlace) {
    assert.equal(pr.length, 5, place);
    assert.ok(Math.abs(pr.reduce((s, r) => s + r.value, 0) - 100) <= 1, place);
  }
});

test('the Ipsos zones cover each Lima district exactly once and have a household income', () => {
  const zones = parsePlaces(readFileSync(join(process.cwd(), STATS_DIR, 'places.csv'), 'utf8')).filter((p) => p.place.startsWith('ipsos-'));
  const districts = zones.flatMap((z) => z.districts);
  assert.equal(districts.length, 43);
  assert.deepEqual(new Set(districts), new Set(LIMA_PROVINCE_DISTRICTS.map((d) => d.slug)));
  const latest = latestStats(readStatFiles(STATS_DIR));
  for (const z of zones) assert.ok(latest.get(z.place)?.get('zone_household_income_pen'), z.place);
  assert.equal(latest.get('ipsos-lima-oeste')!.get('zone_household_income_pen')!.value, 8258);
});
