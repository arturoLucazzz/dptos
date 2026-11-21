import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fixedFromDefaults, DEFAULT_PANEL } from './assumption-defaults';
import { filterListings, monthlyGainFor, queryDepartamentos } from './departamentos-query';
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
    lat: null,
    lon: null,
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
    const result = queryDepartamentos(listings, fixed, { ...base, panel: DEFAULT_PANEL, sort: 'monthlyGain' });
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
    const result = queryDepartamentos(listings, fixed, { ...base, locationMin: 7, sort: 'monthlyGain', order: 'desc' });
    assert.deepEqual(result.rows.map((r) => r.postingId).sort(), ['edge', 'great']);
  });

  it('sort=location orders by score, nulls last in both orders', () => {
    const desc = queryDepartamentos(listings, fixed, { ...base, sort: 'location', order: 'desc' });
    assert.deepEqual(desc.rows.map((r) => r.postingId), ['great', 'edge', 'meh', 'unknown']);
    const asc = queryDepartamentos(listings, fixed, { ...base, sort: 'location', order: 'asc' });
    assert.deepEqual(asc.rows.map((r) => r.postingId), ['meh', 'edge', 'great', 'unknown']);
  });

  it('no location filter applies by default', () => {
    assert.equal(queryDepartamentos(listings, fixed, { ...base, sort: 'monthlyGain', order: 'desc' }).total, 4);
  });

  describe('workspace sorts and area', () => {
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
    const ids = (r: { rows: { postingId: string }[] }) => r.rows.map((x) => x.postingId);

    it('grossYield sorts by yearly rent over price, no rent last in both orders', () => {
      const rows = [
        row({ postingId: 'low', pricePen: 500_000, grossRentPen: 2000 }),
        row({ postingId: 'none', pricePen: 300_000, grossRentPen: null }),
        row({ postingId: 'high', pricePen: 300_000, grossRentPen: 2000 }),
      ];
      assert.deepEqual(ids(queryDepartamentos(rows, fixed, { ...base, sort: 'grossYield', order: 'desc' })), ['high', 'low', 'none']);
      assert.deepEqual(ids(queryDepartamentos(rows, fixed, { ...base, sort: 'grossYield', order: 'asc' })), ['low', 'high', 'none']);
    });

    it('pricePerM2 sorts by price over area, no area last', () => {
      const rows = [
        row({ postingId: 'big', pricePen: 600_000, areaM2: 100 }),
        row({ postingId: 'none', pricePen: 100_000, areaM2: null }),
        row({ postingId: 'small', pricePen: 400_000, areaM2: 100 }),
      ];
      assert.deepEqual(ids(queryDepartamentos(rows, fixed, { ...base, sort: 'pricePerM2', order: 'asc' })), ['small', 'big', 'none']);
      assert.deepEqual(ids(queryDepartamentos(rows, fixed, { ...base, sort: 'pricePerM2', order: 'desc' })), ['big', 'small', 'none']);
    });

    it('newest sorts by days published ascending, nulls last', () => {
      const rows = [
        row({ postingId: 'old', pricePen: 400_000, daysPublished: 90 }),
        row({ postingId: 'none', pricePen: 400_000, daysPublished: null }),
        row({ postingId: 'new', pricePen: 400_000, daysPublished: 2 }),
      ];
      assert.deepEqual(ids(queryDepartamentos(rows, fixed, { ...base, sort: 'newest', order: 'asc' })), ['new', 'old', 'none']);
    });

    it('cashReturn and entryCost sort without throwing', () => {
      const rows = [row({ postingId: 'a', pricePen: 400_000 }), row({ postingId: 'b', pricePen: 600_000 })];
      assert.equal(queryDepartamentos(rows, fixed, { ...base, sort: 'cashReturn', order: 'desc' }).total, 2);
      assert.equal(queryDepartamentos(rows, fixed, { ...base, sort: 'entryCost', order: 'asc' }).total, 2);
    });

    it('area keeps rows inside the ring and drops outside and without coordinates', () => {
      const square: [number, number][] = [[-77.1, -12.2], [-76.9, -12.2], [-76.9, -12.0], [-77.1, -12.0], [-77.1, -12.2]];
      const rows = [
        row({ postingId: 'in', pricePen: 400_000, lat: -12.1, lon: -77.0 }),
        row({ postingId: 'out', pricePen: 400_000, lat: -11.0, lon: -77.0 }),
        row({ postingId: 'nocoord', pricePen: 400_000, lat: null, lon: null }),
      ];
      const r = queryDepartamentos(rows, fixed, { ...base, sort: 'pricePen', order: 'asc', area: square });
      assert.deepEqual(ids(r), ['in']);
      assert.equal(r.total, 1);
    });

    it('without an area keeps rows with no coordinates', () => {
      const rows = [row({ postingId: 'nocoord', pricePen: 400_000, lat: null, lon: null })];
      assert.equal(queryDepartamentos(rows, fixed, { ...base, sort: 'pricePen', order: 'asc' }).total, 1);
    });
  });
});

describe('the light filter for map points', () => {
  const fixed = fixedFromDefaults();
  const square: [number, number][] = [[-77.1, -12.2], [-76.9, -12.2], [-76.9, -12.0], [-77.1, -12.0], [-77.1, -12.2]];
  const listings = [
    row({ postingId: 'a', pricePen: 400_000, bedrooms: 2, lat: -12.1, lon: -77.0, locationScore: 8 }),
    row({ postingId: 'b', pricePen: 600_000, bedrooms: 3, lat: -12.1, lon: -77.0, locationScore: 6 }),
    row({ postingId: 'c', pricePen: 500_000, bedrooms: 1, districtSlug: 'surco', lat: -12.1, lon: -77.0, locationScore: 9 }),
    row({ postingId: 'd', pricePen: 450_000, bedrooms: 2, lat: -13, lon: -78, locationScore: 9 }),
    row({ postingId: 'e', pricePen: 420_000, bedrooms: 2, lat: null, lon: null, locationScore: 9, grossRentPen: null }),
    row({
      postingId: 'f', pricePen: 410_000, bedrooms: null, lat: -12.1, lon: -77.0, locationScore: null,
      copies: [{ postingId: 'f', source: 'adondevivir', url: null, pricePen: 410_000 }],
    }),
  ];
  const base = {
    districts: [], sources: [], priceMin: null, priceMax: null, bedroomsMin: null, bedroomsMax: null, coverageMin: null,
    panel: DEFAULT_PANEL, sort: 'monthlyGain' as const, order: 'desc' as const, page: 1, pageSize: 1000,
  };
  const inputs = [
    base,
    { ...base, districts: ['miraflores'] },
    { ...base, sources: ['urbania' as const] },
    { ...base, priceMin: 410_000, priceMax: 500_000 },
    { ...base, bedroomsMin: 2, bedroomsMax: 2 },
    { ...base, locationMin: 7 },
    { ...base, area: square },
    { ...base, districts: ['miraflores'], bedroomsMin: 2, area: square, locationMin: 5 },
  ];

  it('keeps the same rows as queryDepartamentos for each filter', () => {
    for (const input of inputs) {
      const full = queryDepartamentos(listings, fixed, input).rows.map((r) => r.postingId).sort();
      const light = filterListings(listings, input).map((r) => r.postingId).sort();
      assert.deepEqual(light, full, JSON.stringify(input));
    }
  });

  it('gives the same monthly gain as queryDepartamentos, null without rent or out of reach', () => {
    const pricey = row({ postingId: 'p', pricePen: 2_000_000, grossRentPen: 9_000 });
    const all = [...listings, pricey];
    // Cash that covers the cheaper rows' purchase costs but not the pricey one's.
    const cash = purchaseCosts({ pricePen: 2_000_000, isFirstSaleFromDeveloper: false, assumptions: fixed }).totalPen - 1;
    const panel = { ...DEFAULT_PANEL, cashAvailablePen: cash, extraMonthlyPen: 300 };
    const full = new Map(queryDepartamentos(all, fixed, { ...base, panel }).rows.map((r) => [r.postingId, r.monthlyGainPen]));
    for (const l of all) assert.equal(monthlyGainFor(l, panel, fixed), full.get(l.postingId), l.postingId);
    assert.equal(monthlyGainFor(listings[4], panel, fixed), null);
    assert.equal(monthlyGainFor(pricey, panel, fixed), null);
    assert.ok(all.some((l) => monthlyGainFor(l, panel, fixed) != null), 'some rows have a gain');
  });
});

describe('cashReturn and entryCost order', () => {
  const fixed = fixedFromDefaults();
  const base = {
    districts: [], sources: [], priceMin: null, priceMax: null, bedroomsMin: null, bedroomsMax: null, coverageMin: null,
    panel: DEFAULT_PANEL, page: 1,
  };
  const rows = [
    row({ postingId: 'mid', pricePen: 500_000, grossRentPen: 5_500 }),
    row({ postingId: 'norent', pricePen: 300_000, grossRentPen: null }),
    row({ postingId: 'cheap', pricePen: 300_000, grossRentPen: 4_000 }),
    row({ postingId: 'dear', pricePen: 800_000, grossRentPen: 9_000 }),
  ];
  const ids = (r: { rows: { postingId: string }[] }) => r.rows.map((x) => x.postingId);

  it('entryCost: cheapest cash first ascending, most first descending, no value last in both', () => {
    assert.deepEqual(ids(queryDepartamentos(rows, fixed, { ...base, sort: 'entryCost', order: 'asc' })), ['cheap', 'mid', 'dear', 'norent']);
    assert.deepEqual(ids(queryDepartamentos(rows, fixed, { ...base, sort: 'entryCost', order: 'desc' })), ['dear', 'mid', 'cheap', 'norent']);
  });

  it('cashReturn: follows the yearly return on cash in both orders, no value last in both', () => {
    const desc = queryDepartamentos(rows, fixed, { ...base, sort: 'cashReturn', order: 'desc' }).rows;
    const asc = queryDepartamentos(rows, fixed, { ...base, sort: 'cashReturn', order: 'asc' }).rows;
    const byValue = rows
      .filter((r) => r.grossRentPen != null)
      .map((r) => ({ id: r.postingId, v: desc.find((d) => d.postingId === r.postingId)!.yearlyGainPctOnCash! }))
      .sort((a, b) => b.v - a.v)
      .map((x) => x.id);
    assert.equal(new Set(byValue.map((id) => desc.find((d) => d.postingId === id)!.yearlyGainPctOnCash)).size, 3, 'distinct values');
    assert.deepEqual(ids({ rows: desc }), [...byValue, 'norent']);
    assert.deepEqual(ids({ rows: asc }), [...byValue].reverse().concat('norent'));
  });
});

describe('early payment on the page rows', () => {
  it('a row on page 2 gets the same early-payment result as with one big page', () => {
    const fixed = fixedFromDefaults();
    const rows = [1, 2, 3].map((i) => row({ postingId: `r${i}`, pricePen: 300_000 + i * 50_000, grossRentPen: 2_000 + i * 100 }));
    const base = {
      districts: [], sources: [], priceMin: null, priceMax: null, bedroomsMin: null, bedroomsMax: null, coverageMin: null,
      panel: { ...DEFAULT_PANEL, extraMonthlyPen: 400 }, sort: 'pricePen' as const, order: 'asc' as const,
    };
    const all = queryDepartamentos(rows, fixed, { ...base, page: 1, pageSize: 3 }).rows;
    const second = queryDepartamentos(rows, fixed, { ...base, page: 2, pageSize: 1 }).rows[0]!;
    assert.equal(second.postingId, 'r2');
    assert.ok(second.prepayment && second.prepayment.shorterLoan.monthsSaved > 0);
    assert.deepEqual(second.prepayment, all[1]!.prepayment);
    assert.deepEqual(second.prepaymentLines, all[1]!.prepaymentLines);
  });
});
