import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows } from './refresh';
import type { LocationResult } from './score';

const at = new Date('2026-11-17T12:00:00Z');

test('buildRows maps an OK result with local rent and an OUTSIDE_LIMA result', () => {
  const results: LocationResult[] = [
    {
      propertyId: 'a',
      status: 'OK',
      score: 7.3,
      livability: 8.1,
      demand: 6.5,
      reasons: [{ tone: 'up', text: 'Dentro de San Isidro (tu zona, 9/10)' }],
      localRent: { middlePerM2: 31.25, highPerM2: 36.4, n: 14, maxDistanceM: 781.6 },
    },
    { propertyId: 'b', status: 'OUTSIDE_LIMA', score: null, livability: null, demand: null, reasons: [], localRent: null },
  ];
  const [a, b] = buildRows(results, at);
  assert.deepEqual(a, {
    propertyId: 'a',
    status: 'OK',
    score: 7.3,
    livability: 8.1,
    demand: 6.5,
    reasons: [{ tone: 'up', text: 'Dentro de San Isidro (tu zona, 9/10)' }],
    localRentPerM2: 31.25,
    localRentHighPerM2: 36.4,
    localRentN: 14,
    localRentMaxDistanceM: 782,
    computedAt: at,
  });
  assert.equal(b.status, 'OUTSIDE_LIMA');
  assert.equal(b.score, null);
  assert.equal(b.localRentPerM2, null);
  assert.equal(b.localRentN, null);
  assert.deepEqual(b.reasons, []);
});

test('buildRows stores reasons as JSON and scores as one-decimal values', () => {
  const [row] = buildRows(
    [{ propertyId: 'a', status: 'OK', score: 6.25, livability: 5.04, demand: null, reasons: [{ tone: 'info', text: 'x' }], localRent: null }],
    at,
  );
  assert.equal(row.score, 6.3);
  assert.equal(row.livability, 5);
  assert.equal(row.demand, null);
  assert.equal(JSON.stringify(row.reasons), '[{"tone":"info","text":"x"}]');
});
