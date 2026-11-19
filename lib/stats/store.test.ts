import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStatsLoad } from './store';
import type { StatRow } from './files';

const row: StatRow = { place: 'lince', indicator: 'high_income_pct', value: 19.9, period: '2020', source: 'INEI', sourceRef: 'p. 32', file: 'a.csv' };

test('runStatsLoad keeps the load when the refresh fails', async () => {
  const loaded: StatRow[][] = [];
  const result = await runStatsLoad({
    read: () => [row],
    load: async (r) => {
      loaded.push(r);
      return r.length;
    },
    refresh: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(loaded.length, 1);
  assert.deepEqual(result, { loaded: 1, refreshError: 'boom' });
});

test('runStatsLoad does not load or refresh when the files fail the checks', async () => {
  let calls = 0;
  await assert.rejects(
    runStatsLoad({
      read: () => {
        throw new Error('Lugar desconocido en a.csv, fila 2: callao');
      },
      load: async () => ++calls,
      refresh: async () => ++calls,
    }),
    /Lugar desconocido/,
  );
  assert.equal(calls, 0);
});
