import test from 'node:test';
import assert from 'node:assert/strict';
import type { DepartamentosRow } from './departamentos-query';
import { toHomeRow, HOME_ROW_KEYS } from './home-rows';

test('toHomeRow keeps only the fields Inicio shows or sorts by', () => {
  const full = {
    postingId: 'p1',
    propertyId: 'pr1',
    url: 'https://x/1',
    imageUrl: null,
    districtName: 'Miraflores',
    bedrooms: 2,
    areaM2: 60,
    pricePen: 300000,
    grossRentPen: 1800,
    monthlyGainPen: 120,
    entryCostPen: 70000,
    discountPct: 5,
    daysPublished: 3,
    locationScore: 7.25,
    locationReasons: [{ tone: 'up', text: 'Parque cerca' }],
    copies: [{ big: 'x' }],
    qualityFlags: ['a'],
    prepayment: {},
  } as unknown as DepartamentosRow;
  const out = toHomeRow(full);
  assert.deepEqual(Object.keys(out).sort(), [...HOME_ROW_KEYS].sort());
  assert.equal(out.postingId, 'p1');
  assert.equal(out.locationScore, 7.25);
  assert.equal('copies' in out, false);
});
