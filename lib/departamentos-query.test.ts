import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fixedFromDefaults, DEFAULT_PANEL } from './assumption-defaults';
import { queryDepartamentos, parseDepartamentosSearchParams } from './departamentos-query';
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
