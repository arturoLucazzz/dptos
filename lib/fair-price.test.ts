/**
 * The model is tested against a synthetic market whose true prices are known, so
 * "did the regression work" has an actual answer rather than an opinion about Lima.
 *
 * The market is built to have the property that motivated the whole approach: price
 * per m² falls as apartments get bigger, which a district average cannot represent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fitFairPrice, MIN_COMPARABLES, type Comparable } from './fair-price';

const DISTRICT_FACTOR: Record<string, number> = {
  'san-miguel': 1.0,
  lince: 1.15,
  'jesus-maria': 1.1,
  miraflores: 1.9,
};

/**
 * True price of an apartment in the synthetic market.
 *
 * The 0.9 exponent on area is the point: a 40 m² flat comes out at a higher price
 * per m² than a 90 m² one, without either being mispriced.
 */
function truePrice(row: {
  districtSlug: string;
  areaM2: number;
  bedrooms: number;
  parkingSpots: number;
  antiquityYears: number;
  isNew: boolean;
}): number {
  return (
    11_000 *
    row.areaM2 ** 0.9 *
    DISTRICT_FACTOR[row.districtSlug] *
    (1 + 0.04 * row.bedrooms) *
    (1 + 0.06 * row.parkingSpots) *
    Math.exp(-0.004 * row.antiquityYears) *
    (row.isNew ? 1.08 : 1)
  );
}

/** Deterministic pseudo-random numbers, so a failure is always reproducible. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function syntheticMarket(count: number, noise = 0.08): Comparable[] {
  const random = rng(42);
  const districts = Object.keys(DISTRICT_FACTOR);
  return Array.from({ length: count }, (_, i) => {
    const districtSlug = districts[i % districts.length];
    const bedrooms = 1 + Math.floor(random() * 4);
    const areaM2 = Math.round(28 + bedrooms * 18 + random() * 30);
    const parkingSpots = random() < 0.5 ? 0 : 1;
    const isNew = random() < 0.3;
    const antiquityYears = isNew ? 0 : Math.floor(random() * 35);
    const base = truePrice({ districtSlug, areaM2, bedrooms, parkingSpots, antiquityYears, isNew });
    return {
      districtSlug,
      areaM2,
      bedrooms,
      bathrooms: Math.max(1, bedrooms - 1),
      parkingSpots,
      antiquityYears,
      isNew,
      // Multiplicative noise, because that is how price errors actually behave.
      pricePen: Math.round(base * Math.exp((random() - 0.5) * 2 * noise)),
    };
  });
}

describe('fitFairPrice', () => {
  it('declines to fit a market too small to support a model', () => {
    assert.equal(fitFairPrice(syntheticMarket(MIN_COMPARABLES - 1)), null);
  });

  it('declines when every row is unusable', () => {
    const junk: Comparable[] = Array.from({ length: 200 }, () => ({
      districtSlug: 'lince',
      pricePen: 0,
      areaM2: 0,
      bedrooms: null,
      bathrooms: null,
      parkingSpots: null,
      antiquityYears: null,
      isNew: false,
    }));
    assert.equal(fitFairPrice(junk), null);
  });

  it('explains most of the variance in a noisy market', () => {
    const model = fitFairPrice(syntheticMarket(1200));
    assert.ok(model);
    assert.ok(model.r2 > 0.9, `r2 was ${model.r2}`);
    assert.ok(model.typicalErrorPct < 0.15, `typical error was ${model.typicalErrorPct}`);
  });

  it('predicts a known apartment within a few percent', () => {
    const model = fitFairPrice(syntheticMarket(1200));
    assert.ok(model);
    const subject = {
      districtSlug: 'san-miguel',
      areaM2: 85,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpots: 1,
      antiquityYears: 12,
      isNew: false,
    };
    const expected = truePrice({ ...subject, bedrooms: 3, parkingSpots: 1, antiquityYears: 12 });
    const prediction = model.predict(subject);
    assert.ok(prediction);
    const error = Math.abs(prediction.expectedPen - expected) / expected;
    assert.ok(error < 0.1, `off by ${(error * 100).toFixed(1)}%`);
  });

  it('reports the discount of a listing priced below the model', () => {
    // The plan's worked example: expected ~445,000, asking 399,000, so ~10.3%.
    const model = fitFairPrice(syntheticMarket(1200));
    assert.ok(model);
    const subject = {
      districtSlug: 'san-miguel',
      areaM2: 85,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpots: 1,
      antiquityYears: 12,
      isNew: false,
    };
    const expected = model.predict(subject)!.expectedPen;
    const asking = expected * 0.897;
    const prediction = model.predict(subject, asking);
    assert.ok(prediction?.discountPct != null);
    assert.ok(
      Math.abs(prediction.discountPct - 10.3) < 0.2,
      `discount was ${prediction.discountPct.toFixed(2)}%`
    );
  });

  it('reports a negative discount for an overpriced listing', () => {
    const model = fitFairPrice(syntheticMarket(1200))!;
    const subject = {
      districtSlug: 'lince',
      areaM2: 60,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpots: 0,
      antiquityYears: 20,
      isNew: false,
    };
    const expected = model.predict(subject)!.expectedPen;
    const prediction = model.predict(subject, expected * 1.25);
    assert.ok(prediction?.discountPct != null);
    assert.ok(prediction.discountPct < -15, `discount was ${prediction.discountPct}`);
  });

  it('captures that price per m2 falls as apartments get bigger', () => {
    // This is the whole reason for the regression: a district average would price
    // both of these at the same rate per m² and call the big one a bargain.
    const model = fitFairPrice(syntheticMarket(1200))!;
    const base = {
      districtSlug: 'lince',
      bedrooms: 2,
      bathrooms: 1,
      parkingSpots: 0,
      antiquityYears: 15,
      isNew: false,
    };
    const small = model.predict({ ...base, areaM2: 40 })!;
    const large = model.predict({ ...base, areaM2: 90 })!;
    assert.ok(small.expectedPen / 40 > large.expectedPen / 90);
  });

  it('is not fooled into calling a big apartment cheap', () => {
    // A 90 m² flat priced exactly at its own fair value should read as roughly no
    // discount, even though it is far below the district's average price per m².
    const model = fitFairPrice(syntheticMarket(1200))!;
    const subject = {
      districtSlug: 'lince',
      areaM2: 90,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpots: 1,
      antiquityYears: 10,
      isNew: false,
    };
    const fair = truePrice({ ...subject, bedrooms: 3, parkingSpots: 1, antiquityYears: 10 });
    const prediction = model.predict(subject, fair)!;
    assert.ok(Math.abs(prediction.discountPct!) < 10, `discount was ${prediction.discountPct}`);
  });

  it('marks a thin district and an unusual size as low confidence', () => {
    const market = syntheticMarket(1200);
    // One listing in a district nobody else is in.
    market.push({ ...market[0], districtSlug: 'barranco' });
    const model = fitFairPrice(market)!;

    assert.equal(model.predict({ ...subjectIn('barranco'), areaM2: 70 })!.confidence, 'low');
    assert.equal(model.predict({ ...subjectIn('lince'), areaM2: 70 })!.confidence, 'high');
    // A 400 m² apartment is outside the range the fit ever saw.
    assert.equal(model.predict({ ...subjectIn('lince'), areaM2: 400 })!.confidence, 'low');
  });

  it('exposes district medians with quartiles and a sample size', () => {
    const model = fitFairPrice(syntheticMarket(1200))!;
    const stats = model.statsFor('lince');
    assert.ok(stats);
    assert.ok(stats.n > 100);
    assert.ok(stats.p25PricePen < stats.medianPricePen);
    assert.ok(stats.medianPricePen < stats.p75PricePen);
    assert.ok(stats.p25PricePerM2 < stats.p75PricePerM2);
    assert.equal(model.statsFor('nowhere'), null);
  });

  it('still predicts when the listing omits rooms and parking', () => {
    const model = fitFairPrice(syntheticMarket(1200))!;
    const prediction = model.predict({
      districtSlug: 'lince',
      areaM2: 70,
      bedrooms: null,
      bathrooms: null,
      parkingSpots: null,
      antiquityYears: null,
      isNew: false,
    });
    assert.ok(prediction);
    assert.ok(prediction.expectedPen > 0);
  });

  it('refuses a subject with no area', () => {
    const model = fitFairPrice(syntheticMarket(1200))!;
    assert.equal(model.predict({ ...subjectIn('lince'), areaM2: 0 }), null);
    assert.equal(model.predict({ ...subjectIn('lince'), areaM2: Number.NaN }), null);
  });

  it('is not derailed by absurd listings that survived the quality flags', () => {
    const market = syntheticMarket(1200);
    const clean = fitFairPrice(market)!;
    const subject = { ...subjectIn('lince'), areaM2: 70 };
    const before = clean.predict(subject)!.expectedPen;

    // A parking space listed as an apartment, and a whole building as one unit.
    for (let i = 0; i < 20; i++) {
      market.push({ ...subjectIn('lince'), areaM2: 70, pricePen: 1_000, bathrooms: 1 } as Comparable);
      market.push({ ...subjectIn('lince'), areaM2: 70, pricePen: 90_000_000, bathrooms: 1 } as Comparable);
    }
    const after = fitFairPrice(market)!.predict(subject)!.expectedPen;
    const drift = Math.abs(after - before) / before;
    assert.ok(drift < 0.1, `the outliers moved the prediction by ${(drift * 100).toFixed(1)}%`);
  });
});

function subjectIn(districtSlug: string) {
  return {
    districtSlug,
    areaM2: 70,
    bedrooms: 2,
    bathrooms: 1,
    parkingSpots: 0,
    antiquityYears: 15,
    isNew: false,
    pricePen: 500_000,
  };
}
