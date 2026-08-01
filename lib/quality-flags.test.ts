import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  flagsForListing,
  flagsFromSlug,
  isUsableComparable,
  pricePerM2OutlierMask,
  MIN_ROWS_FOR_OUTLIER_TEST,
  type PriceOutlierRow,
} from './quality-flags';

describe('flagsForListing', () => {
  it('accepts an ordinary sale without complaint', () => {
    assert.deepEqual(flagsForListing({ operation: 'SALE', pricePen: 420_000, areaM2: 65 }), []);
  });

  it('separates a rent filed as a sale from a merely cheap sale', () => {
    assert.deepEqual(flagsForListing({ operation: 'SALE', pricePen: 2_500, areaM2: 65 }), ['PROBABLY_RENT']);
    assert.deepEqual(flagsForListing({ operation: 'SALE', pricePen: 60_000, areaM2: 65 }), [
      'IMPLAUSIBLE_SALE_PRICE',
    ]);
  });

  it('does not cap high rents, only implausible ones', () => {
    // San Isidro genuinely rents at these prices; a ceiling here would delete them.
    assert.deepEqual(flagsForListing({ operation: 'RENT', pricePen: 18_000, areaM2: 180 }), []);
    assert.deepEqual(flagsForListing({ operation: 'RENT', pricePen: 45_000, areaM2: 180 }), [
      'IMPLAUSIBLE_RENT',
    ]);
    assert.deepEqual(flagsForListing({ operation: 'RENT', pricePen: 450_000, areaM2: 180 }), [
      'PROBABLY_SALE',
    ]);
  });

  it('flags missing and impossible areas', () => {
    assert.deepEqual(flagsForListing({ operation: 'SALE', pricePen: 420_000, areaM2: null }), [
      'MISSING_AREA',
    ]);
    // A real listing: 8 m² for S/ 493,000.
    assert.deepEqual(flagsForListing({ operation: 'SALE', pricePen: 493_000, areaM2: 8 }), [
      'IMPLAUSIBLE_AREA',
    ]);
  });

  it('marks a project price as the lower bound it is', () => {
    assert.deepEqual(
      flagsForListing({ operation: 'SALE', pricePen: 350_000, areaM2: 55, priceIsFrom: true }),
      ['PRICE_IS_FROM']
    );
  });
});

describe('isUsableComparable', () => {
  it('keeps rows whose only problem is cosmetic', () => {
    assert.equal(isUsableComparable([]), true);
    assert.equal(isUsableComparable(['MISSING_AREA']), true);
    assert.equal(isUsableComparable(['SLUG_DISTRICT_MISMATCH']), true);
  });

  it('rejects rows that would move a coefficient on their own', () => {
    assert.equal(isUsableComparable(['PROBABLY_RENT']), false);
    assert.equal(isUsableComparable(['PRICE_IS_FROM']), false);
    assert.equal(isUsableComparable(['OUTLIER_PRICE_PER_M2']), false);
    assert.equal(isUsableComparable(['MISSING_AREA', 'IMPLAUSIBLE_AREA']), false);
  });
});

describe('flagsFromSlug', () => {
  it('says nothing when the slug agrees with the features', () => {
    assert.deepEqual(
      flagsFromSlug({
        sourcePath: '/inmueble/clasificado/veclapin-venta-de-departamento-en-lince-lima-1-dormitorio-149368316',
        bedrooms: 1,
        districtName: 'Lince',
      }),
      []
    );
  });

  it('catches Urbania disagreeing with itself about bedrooms', () => {
    assert.deepEqual(
      flagsFromSlug({
        sourcePath: '/inmueble/clasificado/veclapin-venta-de-departamento-en-lince-lima-3-dormitorios-149368316',
        bedrooms: 1,
        districtName: 'Lince',
      }),
      ['SLUG_BEDROOMS_MISMATCH']
    );
  });

  it('catches a district that does not appear in its own URL', () => {
    assert.deepEqual(
      flagsFromSlug({
        sourcePath: '/inmueble/clasificado/veclapin-venta-de-departamento-en-lince-lima-2-dormitorios-149368316',
        bedrooms: 2,
        districtName: 'Jesús María',
      }),
      ['SLUG_DISTRICT_MISMATCH']
    );
  });

  it('matches district names with accents against the slug', () => {
    assert.deepEqual(
      flagsFromSlug({
        sourcePath: '/inmueble/clasificado/venta-de-departamento-en-jesus-maria-lima-2-dormitorios-1',
        bedrooms: 2,
        districtName: 'Jesús María',
      }),
      []
    );
  });

  it('stays quiet on project slugs that name no district', () => {
    assert.deepEqual(
      flagsFromSlug({
        sourcePath: '/inmueble/proyecto/ememvein-proyecto-mural-lince-lima-lince-grupo-tyc-149310505',
        bedrooms: null,
        districtName: 'Lince',
      }),
      []
    );
    assert.deepEqual(flagsFromSlug({ sourcePath: null, bedrooms: 2, districtName: 'Lince' }), []);
  });
});

describe('pricePerM2OutlierMask', () => {
  /** A district of ordinary listings around S/ 7,500/m², like Lince. */
  function ordinaryDistrict(count: number, districtSlug = 'lince'): PriceOutlierRow[] {
    return Array.from({ length: count }, (_, i) => {
      const areaM2 = 45 + (i % 40);
      // Spread of roughly +/-25% around 7,500/m².
      const perM2 = 7_500 * (1 + (((i * 37) % 50) - 25) / 100);
      return { districtSlug, pricePen: Math.round(areaM2 * perM2), areaM2 };
    });
  }

  it('flags nothing in a district of ordinary listings', () => {
    const rows = ordinaryDistrict(120);
    assert.equal(pricePerM2OutlierMask(rows).filter(Boolean).length, 0);
  });

  it('flags the real S/ 55,275,000 listing for 60 m2', () => {
    const rows = [...ordinaryDistrict(120), { districtSlug: 'lince', pricePen: 55_275_000, areaM2: 60 }];
    const mask = pricePerM2OutlierMask(rows);
    assert.equal(mask[mask.length - 1], true);
    assert.equal(mask.slice(0, -1).filter(Boolean).length, 0, 'nothing else should be flagged');
  });

  it('flags an absurdly cheap price per m2 as well', () => {
    const rows = [...ordinaryDistrict(120), { districtSlug: 'lince', pricePen: 12_000, areaM2: 70 }];
    const mask = pricePerM2OutlierMask(rows);
    assert.equal(mask[mask.length - 1], true);
  });

  it('leaves a genuinely expensive apartment alone', () => {
    // Twice the district median per m² is a nice apartment, not a data error.
    const rows = [...ordinaryDistrict(120), { districtSlug: 'lince', pricePen: 15_000 * 90, areaM2: 90 }];
    const mask = pricePerM2OutlierMask(rows);
    assert.equal(mask[mask.length - 1], false);
  });

  it('judges each district against itself', () => {
    // Miraflores at 14,000/m² is normal there and must not be flagged as an
    // outlier just because Lince is cheaper.
    const rows = [
      ...ordinaryDistrict(60, 'lince'),
      ...ordinaryDistrict(60, 'miraflores').map((r) => ({ ...r, pricePen: r.pricePen! * 2 })),
    ];
    assert.equal(pricePerM2OutlierMask(rows).filter(Boolean).length, 0);
  });

  it('refuses to judge a district with too few listings', () => {
    // One row short of the threshold, counting the outlier itself.
    const rows: PriceOutlierRow[] = [
      ...ordinaryDistrict(MIN_ROWS_FOR_OUTLIER_TEST - 2),
      { districtSlug: 'lince', pricePen: 55_275_000, areaM2: 60 },
    ];
    // With no distribution to compare against, silence beats a guess.
    assert.equal(pricePerM2OutlierMask(rows).filter(Boolean).length, 0);
  });

  it('ignores rows with no price or area instead of flagging them', () => {
    const rows: PriceOutlierRow[] = [
      ...ordinaryDistrict(120),
      { districtSlug: 'lince', pricePen: null, areaM2: 60 },
      { districtSlug: 'lince', pricePen: 400_000, areaM2: null },
      { districtSlug: 'lince', pricePen: 400_000, areaM2: 0 },
    ];
    const mask = pricePerM2OutlierMask(rows);
    assert.deepEqual(mask.slice(-3), [false, false, false]);
  });

  it('survives a district where every listing is identical', () => {
    const rows: PriceOutlierRow[] = Array.from({ length: 40 }, () => ({
      districtSlug: 'lince',
      pricePen: 500_000,
      areaM2: 65,
    }));
    assert.equal(pricePerM2OutlierMask(rows).filter(Boolean).length, 0);
  });
});
