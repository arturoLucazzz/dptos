import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridIndex } from './geo';
import { LOCAL_RENT_K, LOCAL_RENT_MIN, LOCAL_RENT_RADIUS_M, localRent, type RentPoint } from './local-rent';
import { M_PER_DEG_LAT } from './test-helpers';
import { quantile } from '../linalg';

const center = { lat: -12.09, lon: -77.03 };

function rentAt(m: number, perM2: number, bedrooms: number | null = 2): RentPoint {
  return { lat: center.lat + m / M_PER_DEG_LAT, lon: center.lon, perM2, bedrooms };
}

test('the constants match the spec', () => {
  assert.equal(LOCAL_RENT_RADIUS_M, 1_000);
  assert.equal(LOCAL_RENT_K, 15);
  assert.equal(LOCAL_RENT_MIN, 8);
});

test('uses the rents of the same bedroom group within 1 km', () => {
  const rents = Array.from({ length: 20 }, (_, i) => {
    const m = (i + 1) * 100 - 5;
    return rentAt(m, m <= 1_000 ? 30 : 50);
  });
  const r = localRent({ ...center, bedrooms: 2 }, new GridIndex(rents));
  assert.equal(r?.n, 10);
  assert.equal(r?.middlePerM2, 30);
  assert.ok(Math.abs((r?.maxDistanceM ?? 0) - 995) < 1);
});

test('keeps only the 15 nearest when more are near', () => {
  const rents = Array.from({ length: 30 }, (_, i) => rentAt((i + 1) * 30, i < 15 ? 30 : 60));
  const r = localRent({ ...center, bedrooms: 2 }, new GridIndex(rents));
  assert.equal(r?.n, 15);
  assert.equal(r?.middlePerM2, 30);
  assert.equal(r?.highPerM2, 30);
});

test('ignores other bedroom groups', () => {
  const rents = [
    ...Array.from({ length: 10 }, (_, i) => rentAt((i + 1) * 50, 30, 2)),
    ...Array.from({ length: 10 }, (_, i) => rentAt((i + 1) * 40, 80, 3)),
  ];
  const r = localRent({ ...center, bedrooms: 2 }, new GridIndex(rents));
  assert.equal(r?.n, 10);
  assert.equal(r?.middlePerM2, 30);
});

test('returns null with fewer than 8 nearby rents', () => {
  const rents = Array.from({ length: 7 }, (_, i) => rentAt((i + 1) * 50, 30));
  assert.equal(localRent({ ...center, bedrooms: 2 }, new GridIndex(rents)), null);
  assert.equal(localRent({ ...center, bedrooms: 2 }, new GridIndex<RentPoint>([])), null);
});

test('high end is the 75th percentile', () => {
  const values = Array.from({ length: 15 }, (_, i) => 20 + i);
  const rents = values.map((v, i) => rentAt((i + 1) * 50, v));
  const r = localRent({ ...center, bedrooms: 2 }, new GridIndex(rents));
  assert.equal(r?.highPerM2, quantile(values, 0.75));
  assert.equal(r?.middlePerM2, 27);
});

test('a subject with null bedrooms uses rents of any group', () => {
  const rents = [
    ...Array.from({ length: 4 }, (_, i) => rentAt((i + 1) * 50, 30, 1)),
    ...Array.from({ length: 4 }, (_, i) => rentAt((i + 1) * 60, 30, 3)),
  ];
  assert.equal(localRent({ ...center, bedrooms: null }, new GridIndex(rents))?.n, 8);
});
