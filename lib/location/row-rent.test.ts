import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentForRow } from './row-rent';
import type { RentEstimate } from '../rent';

function districtAt(perM2: number, areaM2 = 70): RentEstimate {
  return { grossRentPen: perM2 * areaM2, n: 30, usedDistrictFallback: false, confidence: 'high' };
}

test('rentForRow uses the local middle for the money and keeps the high end apart', () => {
  const r = rentForRow({ areaM2: 70, local: { perM2: 30, highPerM2: 36, n: 14, maxDistanceM: 780 }, district: districtAt(25) });
  assert.equal(r.grossRentPen, 2_100);
  assert.equal(r.rentHighPen, 2_520);
  assert.equal(r.rentIsLocal, true);
  assert.equal(r.rentSampleN, 14);
  assert.equal(r.rentConfidence, 'high');
  assert.equal(r.rentMaxDistanceM, 780);
});

test('rentForRow marks a local sample under 12 as low confidence', () => {
  const r = rentForRow({ areaM2: 70, local: { perM2: 30, highPerM2: 36, n: 9, maxDistanceM: 900 }, district: null });
  assert.equal(r.rentConfidence, 'low');
});

test('rentForRow falls back to the district estimate', () => {
  const r = rentForRow({ areaM2: 70, local: null, district: districtAt(25) });
  assert.equal(r.grossRentPen, 1_750);
  assert.equal(r.rentIsLocal, false);
  assert.equal(r.rentHighPen, null);
  assert.equal(r.rentSampleN, 30);
  assert.equal(r.rentConfidence, 'high');
  assert.equal(r.rentMaxDistanceM, null);
});

test('rentForRow with no area cannot use the local rate and falls back', () => {
  const r = rentForRow({ areaM2: null, local: { perM2: 30, highPerM2: 36, n: 14, maxDistanceM: 780 }, district: null });
  assert.equal(r.grossRentPen, null);
  assert.equal(r.rentIsLocal, false);
  assert.equal(r.rentSampleN, null);
});
