import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStatFiles, STATS_DIR } from './store';

test('the committed statistics files load', () => {
  const rows = readStatFiles(STATS_DIR);
  const income = rows.filter((r) => r.indicator === 'high_income_pct');
  assert.equal(income.length, 43);
  assert.equal(income.find((r) => r.place === 'san-isidro')!.value, 100);
  assert.equal(income.find((r) => r.place === 'lince')!.value, 19.9);
});
