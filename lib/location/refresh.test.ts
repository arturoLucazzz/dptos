import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, zoneShapes } from './refresh';
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

test('zoneShapes passes a POLYGON zone with its boundary rings and skips one without', () => {
  const ring: [number, number][] = [[-77.04, -12.12], [-77.02, -12.12], [-77.02, -12.1], [-77.04, -12.12]];
  const base = { latitude: null, longitude: null, radiusM: null, districtSlug: null, boundary: null };
  const shapes = zoneShapes(
    [
      { ...base, id: 'p', name: 'Mi zona', rating: 8, kind: 'POLYGON', boundary: [ring] },
      { ...base, id: 'q', name: 'Sin borde', rating: 8, kind: 'POLYGON' },
      { ...base, id: 'd', name: 'San Isidro', rating: 9, kind: 'DISTRICT', districtSlug: 'san-isidro' },
      { ...base, id: 'c', name: 'Parque', rating: 7, kind: 'CIRCLE', latitude: -12.1, longitude: -77.03, radiusM: 300 },
    ],
    new Map([['san-isidro', [ring]]]),
  );
  assert.deepEqual(shapes, [
    { id: 'p', name: 'Mi zona', rating: 8, kind: 'POLYGON', rings: [ring] },
    { id: 'd', name: 'San Isidro', rating: 9, kind: 'DISTRICT', districtSlug: 'san-isidro', rings: [ring] },
    { id: 'c', name: 'Parque', rating: 7, kind: 'CIRCLE', lat: -12.1, lon: -77.03, radiusM: 300 },
  ]);
});
