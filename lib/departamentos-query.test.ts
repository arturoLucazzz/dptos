import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fixedFromDefaults, DEFAULT_PANEL } from './assumption-defaults';
import { queryDepartamentos, parseDepartamentosSearchParams } from './departamentos-query';
import { purchaseCosts } from './costs';
import type { ListingRow } from './listing-row';

function row(partial: Partial<ListingRow> & Pick<ListingRow, 'postingId' | 'pricePen'>): ListingRow {
  return {
    propertyId: null,
    sourcePostingId: partial.postingId,
    sourcePath: null,
    districtSlug: 'miraflores',
    districtName: 'Miraflores',
    operation: 'SALE',
    areaM2: 80,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpots: 1,
    antiquityYears: 5,
    isNew: false,
    isFirstSaleFromDeveloper: false,
    maintenancePen: 300,
    grossRentPen: 2500,
    rentSampleN: 10,
    rentConfidence: 'high',
    discountPct: 5,
    fairPricePen: partial.pricePen * 1.05,
    fairPriceConfidence: 'high',
    daysPublished: 30,
    daysPublishedEstimated: false,
    listingCount: 1,
    priceCutCount: 0,
    totalCutPct: 0,
    inventoryMonths: 6,
    priceCutScore: 40,
    qualityFlags: [],
    address: null,
    title: null,
    imageUrl: null,
    favorite: false,
    discarded: false,
    source: 'urbania',
    copies: [{ postingId: partial.postingId, source: 'urbania', url: null, pricePen: partial.pricePen }],
    priceMaxPen: partial.pricePen,
    url: null,
    duplicateFlags: [],
    locationStatus: null,
    locationScore: null,
    locationLivability: null,
    locationDemand: null,
    locationReasons: [],
    rentHighPen: null,
    rentIsLocal: false,
    rentMaxDistanceM: null,
    ...partial,
  };
}

describe('queryDepartamentos', () => {
  const fixed = fixedFromDefaults();
  const listings = [
    row({ postingId: 'a', pricePen: 400_000, bedrooms: 2, discountPct: 10 }),
    row({ postingId: 'b', pricePen: 600_000, bedrooms: 3, discountPct: -5 }),
    row({ postingId: 'c', pricePen: 500_000, bedrooms: 1, districtSlug: 'surco', districtName: 'Surco' }),
  ];

  it('filters by bedrooms and district', () => {
    const result = queryDepartamentos(listings, fixed, {
      districts: ['miraflores'],
      sources: [],
      priceMin: null,
      priceMax: null,
      bedroomsMin: 2,
      bedroomsMax: 2,
      coverageMin: null,
      panel: DEFAULT_PANEL,
      sort: 'pricePen',
      order: 'asc',
      page: 1,
      pageSize: 50,
    });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0]?.postingId, 'a');
  });

  it('paginates and returns server finance fields', () => {
    const result = queryDepartamentos(listings, fixed, {
      districts: [],
      sources: [],
      priceMin: null,
      priceMax: null,
      bedroomsMin: null,
      bedroomsMax: null,
      coverageMin: null,
      panel: DEFAULT_PANEL,
      sort: 'pricePen',
      order: 'asc',
      page: 1,
      pageSize: 2,
    });
    assert.equal(result.rows.length, 2);
    assert.equal(result.total, 3);
    assert.ok(result.rows[0]?.paymentPen != null);
    assert.ok(result.stats.total === 3);
  });

  it('filters by source', () => {
    const multi = [
      row({ postingId: 'a', pricePen: 400_000 }),
      row({
        postingId: 'b',
        pricePen: 399_000,
        source: 'remax',
        copies: [
          { postingId: 'b', source: 'remax', url: null, pricePen: 399_000 },
          { postingId: 'b2', source: 'urbania', url: null, pricePen: 420_000 },
        ],
      }),
      row({
        postingId: 'c',
        pricePen: 410_000,
        copies: [
          { postingId: 'c', source: 'urbania', url: null, pricePen: 410_000 },
          { postingId: 'c2', source: 'remax', url: null, pricePen: 415_000 },
        ],
      }),
    ];
    const result = queryDepartamentos(multi, fixed, {
      districts: [],
      sources: ['remax'],
      priceMin: null,
      priceMax: null,
      bedroomsMin: null,
      bedroomsMax: null,
      coverageMin: null,
      panel: DEFAULT_PANEL,
      sort: 'pricePen',
      order: 'asc',
      page: 1,
    });
    assert.deepEqual(result.rows.map((r) => r.postingId), ['b', 'c']);
  });
});

describe('parseDepartamentosSearchParams', () => {
  it('reads hipoteca and filters from the query string', () => {
    const params = new URLSearchParams(
      'districts=miraflores,surco&bedroomsMin=2&inicial=20&tea=7.5&sort=aporte&order=asc&page=2'
    );
    const parsed = parseDepartamentosSearchParams(params);
    assert.deepEqual(parsed.districts, ['miraflores', 'surco']);
    assert.equal(parsed.bedroomsMin, 2);
    assert.equal(parsed.panel.downPaymentPct, 20);
    assert.equal(parsed.panel.tea, 7.5);
    assert.equal(parsed.sort, 'aporte');
    assert.equal(parsed.order, 'asc');
    assert.equal(parsed.page, 2);
    assert.deepEqual(parsed.sources, []);
  });

  it('reads fuentes and ignores unknown sources', () => {
    const parsed = parseDepartamentosSearchParams(new URLSearchParams('fuentes=remax,ebay,urbania'));
    assert.deepEqual(parsed.sources, ['remax', 'urbania']);
  });
});

describe('queryDepartamentos investor numbers', () => {
  const fixed = fixedFromDefaults();
  const base = {
    districts: [],
    sources: [],
    priceMin: null,
    priceMax: null,
    bedroomsMin: null,
    bedroomsMax: null,
    coverageMin: null,
    order: 'desc' as const,
    page: 1,
  };
  const listings = [
    row({ postingId: 'cheap-rent', pricePen: 250_000, grossRentPen: 2_400 }),
    row({ postingId: 'pricey', pricePen: 700_000, grossRentPen: 2_400 }),
    row({ postingId: 'no-rent', pricePen: 200_000, grossRentPen: null }),
  ];

  it('sorts by monthly gain by default, highest first, rows without rent last', () => {
    const params = parseDepartamentosSearchParams(new URLSearchParams());
    assert.equal(params.sort, 'monthlyGain');
    const result = queryDepartamentos(listings, fixed, { ...base, panel: DEFAULT_PANEL, sort: params.sort });
    assert.deepEqual(result.rows.map((r) => r.postingId), ['cheap-rent', 'pricey', 'no-rent']);
    const last = result.rows[2]!;
    assert.equal(last.monthlyGainPen, null);
    assert.equal(last.yearlyGainPctOnCash, null);
    assert.equal(last.totalAddedUntilCrossoverPen, null);
  });

  it('puts all the cash in on day one when cash is below price plus costs', () => {
    const panel = { ...DEFAULT_PANEL, cashAvailablePen: 80_000 };
    const result = queryDepartamentos(listings, fixed, { ...base, panel, sort: 'monthlyGain' });
    const row = result.rows.find((r) => r.postingId === 'pricey')!;
    assert.ok(Math.abs(row.entryCostPen! - 80_000) < 0.01, `entry ${row.entryCostPen}`);
  });

  it('adds early-payment savings when an extra amount is set', () => {
    const panel = { ...DEFAULT_PANEL, extraMonthlyPen: 500 };
    const result = queryDepartamentos(listings, fixed, { ...base, panel, sort: 'monthlyGain' });
    assert.ok(result.rows[0]!.prepayment!.shorterLoan.monthsSaved > 0);
    const none = queryDepartamentos(listings, fixed, { ...base, panel: DEFAULT_PANEL, sort: 'monthlyGain' });
    assert.equal(none.rows[0]!.prepayment, null);
  });

  it('reads efectivo and extra from the query string', () => {
    const params = parseDepartamentosSearchParams(new URLSearchParams('efectivo=80000&extra=500'));
    assert.equal(params.panel.cashAvailablePen, 80_000);
    assert.equal(params.panel.extraMonthlyPen, 500);
  });
});

describe('queryDepartamentos out of reach', () => {
  it('shows no money numbers for a row the cash cannot reach, and ranks it after reachable rows', () => {
    const fixed = fixedFromDefaults();
    const cheap = row({ postingId: 'reachable', pricePen: 200_000, grossRentPen: 500 });
    const pricey = row({ postingId: 'out-of-reach', pricePen: 900_000, grossRentPen: 9_000 });
    const costOf = (pricePen: number) => purchaseCosts({ pricePen, isFirstSaleFromDeveloper: false, assumptions: fixed }).totalPen;
    const cash = (costOf(200_000) + costOf(900_000)) / 2;
    const result = queryDepartamentos([pricey, cheap], fixed, {
      districts: [], sources: [], priceMin: null, priceMax: null, bedroomsMin: null, bedroomsMax: null, coverageMin: null,
      panel: { ...DEFAULT_PANEL, cashAvailablePen: cash, extraMonthlyPen: 500 },
      sort: 'monthlyGain', order: 'desc', page: 1,
    });
    assert.deepEqual(result.rows.map((r) => r.postingId), ['reachable', 'out-of-reach']);
    const out = result.rows[1]!;
    assert.equal(out.outOfReach, true);
    assert.equal(out.monthlyGainPen, null);
    assert.equal(out.entryCostPen, null);
    assert.equal(out.totalAddedUntilCrossoverPen, null);
    assert.equal(out.prepayment, null);
  });
});

describe('queryDepartamentos location', () => {
  const fixed = fixedFromDefaults();
  const base = {
    districts: [],
    sources: [],
    priceMin: null,
    priceMax: null,
    bedroomsMin: null,
    bedroomsMax: null,
    coverageMin: null,
    panel: DEFAULT_PANEL,
    page: 1,
  };
  const listings = [
    row({ postingId: 'great', pricePen: 400_000, locationStatus: 'OK', locationScore: 8.2 }),
    row({ postingId: 'edge', pricePen: 400_000, locationStatus: 'OK', locationScore: 7 }),
    row({ postingId: 'meh', pricePen: 400_000, locationStatus: 'OK', locationScore: 5.1 }),
    row({ postingId: 'unknown', pricePen: 400_000, locationStatus: 'NO_COORDINATES', locationScore: null }),
  ];

  it('ubicacion=7 keeps rows with score ≥ 7 and drops null scores', () => {
    const params = parseDepartamentosSearchParams(new URLSearchParams('ubicacion=7'));
    assert.equal(params.locationMin, 7);
    const result = queryDepartamentos(listings, fixed, { ...base, locationMin: params.locationMin, sort: 'monthlyGain', order: 'desc' });
    assert.deepEqual(result.rows.map((r) => r.postingId).sort(), ['edge', 'great']);
  });

  it('sort=location orders by score, nulls last in both orders', () => {
    const params = parseDepartamentosSearchParams(new URLSearchParams('sort=location'));
    assert.equal(params.sort, 'location');
    const desc = queryDepartamentos(listings, fixed, { ...base, sort: 'location', order: 'desc' });
    assert.deepEqual(desc.rows.map((r) => r.postingId), ['great', 'edge', 'meh', 'unknown']);
    const asc = queryDepartamentos(listings, fixed, { ...base, sort: 'location', order: 'asc' });
    assert.deepEqual(asc.rows.map((r) => r.postingId), ['meh', 'edge', 'great', 'unknown']);
  });

  it('the default sort is still monthlyGain and no location filter applies', () => {
    const params = parseDepartamentosSearchParams(new URLSearchParams());
    assert.equal(params.sort, 'monthlyGain');
    assert.equal(params.locationMin, null);
    assert.equal(queryDepartamentos(listings, fixed, { ...base, sort: params.sort, order: 'desc' }).total, 4);
  });
});
