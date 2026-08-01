import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bedroomBucket,
  buildRentIndex,
  estimateGrossRent,
  MIN_RENT_SAMPLE,
  type RentObservation,
} from './rent';

/** Rentals at a known rent per m², so the median has a right answer. */
function rentals(input: {
  districtSlug: string;
  bedrooms: number | null;
  perM2: number;
  count: number;
}): RentObservation[] {
  return Array.from({ length: input.count }, (_, i) => {
    const areaM2 = 40 + (i % 30);
    return {
      districtSlug: input.districtSlug,
      bedrooms: input.bedrooms,
      areaM2,
      // Symmetric spread, so the median lands on the stated rate.
      pricePen: areaM2 * input.perM2 * (1 + ((i % 5) - 2) / 100),
    };
  });
}

describe('bedroomBucket', () => {
  it('pools the large apartments and rejects nonsense', () => {
    assert.equal(bedroomBucket(2), 2);
    assert.equal(bedroomBucket(7), 4);
    assert.equal(bedroomBucket(0), 0);
    assert.equal(bedroomBucket(null), null);
    assert.equal(bedroomBucket(-1), null);
  });
});

describe('buildRentIndex', () => {
  it('recovers the rent per m2 of each district and bedroom count', () => {
    const index = buildRentIndex([
      ...rentals({ districtSlug: 'lince', bedrooms: 1, perM2: 50, count: 30 }),
      ...rentals({ districtSlug: 'lince', bedrooms: 3, perM2: 38, count: 30 }),
      ...rentals({ districtSlug: 'miraflores', bedrooms: 1, perM2: 90, count: 30 }),
    ]);

    assert.ok(Math.abs(index.lookup('lince', 1)!.medianPerM2 - 50) < 1);
    assert.ok(Math.abs(index.lookup('lince', 3)!.medianPerM2 - 38) < 1);
    assert.ok(Math.abs(index.lookup('miraflores', 1)!.medianPerM2 - 90) < 1);
  });

  it('ignores combinations with too few rentals to mean anything', () => {
    const index = buildRentIndex(
      rentals({ districtSlug: 'lince', bedrooms: 1, perM2: 50, count: MIN_RENT_SAMPLE - 1 })
    );
    assert.equal(index.cells.length, 0);
    assert.equal(index.lookup('lince', 1), null);
  });

  it('falls back to the district when a bedroom count is thin', () => {
    const index = buildRentIndex([
      ...rentals({ districtSlug: 'lince', bedrooms: 1, perM2: 50, count: 30 }),
      // Only two four-bedroom rentals: not enough for its own row.
      ...rentals({ districtSlug: 'lince', bedrooms: 4, perM2: 30, count: 2 }),
    ]);

    const cell = index.lookup('lince', 4);
    assert.ok(cell);
    assert.equal(cell.bedrooms, null, 'should have fallen back to the district-wide row');
  });

  it('never falls back across districts', () => {
    const index = buildRentIndex(rentals({ districtSlug: 'lince', bedrooms: 1, perM2: 50, count: 30 }));
    assert.equal(index.lookup('miraflores', 1), null);
  });

  it('skips rows with no usable price or area', () => {
    const index = buildRentIndex([
      ...rentals({ districtSlug: 'lince', bedrooms: 1, perM2: 50, count: 30 }),
      { districtSlug: 'lince', bedrooms: 1, areaM2: 0, pricePen: 2_000 },
      { districtSlug: 'lince', bedrooms: 1, areaM2: 60, pricePen: 0 },
    ]);
    assert.equal(index.lookup('lince', 1)!.n, 30);
  });

  it('reports quartiles so the spread is visible', () => {
    const index = buildRentIndex(rentals({ districtSlug: 'lince', bedrooms: 1, perM2: 50, count: 30 }));
    const cell = index.lookup('lince', 1)!;
    assert.ok(cell.p25PerM2 < cell.medianPerM2);
    assert.ok(cell.medianPerM2 < cell.p75PerM2);
  });
});

describe('estimateGrossRent', () => {
  const index = buildRentIndex([
    ...rentals({ districtSlug: 'lince', bedrooms: 1, perM2: 50, count: 30 }),
    ...rentals({ districtSlug: 'lince', bedrooms: 2, perM2: 44, count: 12 }),
    ...rentals({ districtSlug: 'lince', bedrooms: 4, perM2: 30, count: 2 }),
  ]);

  it('multiplies the district rate by the area', () => {
    const estimate = estimateGrossRent(index, { districtSlug: 'lince', areaM2: 60, bedrooms: 1 });
    assert.ok(estimate);
    assert.ok(Math.abs(estimate.grossRentPen - 3_000) < 60, `rent was ${estimate.grossRentPen}`);
    assert.equal(estimate.confidence, 'high');
    assert.equal(estimate.usedDistrictFallback, false);
  });

  it('marks a thin sample as low confidence instead of hiding it', () => {
    const estimate = estimateGrossRent(index, { districtSlug: 'lince', areaM2: 70, bedrooms: 2 });
    assert.ok(estimate);
    assert.equal(estimate.n, 12);
    assert.equal(estimate.confidence, 'low');
  });

  it('says when it had to fall back to the district', () => {
    const estimate = estimateGrossRent(index, { districtSlug: 'lince', areaM2: 120, bedrooms: 4 });
    assert.ok(estimate);
    assert.equal(estimate.usedDistrictFallback, true);
    assert.equal(estimate.confidence, 'low');
  });

  it('returns nothing rather than a number with no basis', () => {
    assert.equal(estimateGrossRent(index, { districtSlug: 'surquillo', areaM2: 60, bedrooms: 1 }), null);
    assert.equal(estimateGrossRent(index, { districtSlug: 'lince', areaM2: null, bedrooms: 1 }), null);
    assert.equal(estimateGrossRent(index, { districtSlug: 'lince', areaM2: 0, bedrooms: 1 }), null);
  });

  it('scales with area, which is the point of using rent per m2', () => {
    const small = estimateGrossRent(index, { districtSlug: 'lince', areaM2: 40, bedrooms: 1 })!;
    const large = estimateGrossRent(index, { districtSlug: 'lince', areaM2: 80, bedrooms: 1 })!;
    assert.ok(Math.abs(large.grossRentPen / small.grossRentPen - 2) < 0.01);
  });
});
