/**
 * Every case here is a real pair from a Lince run, because the interesting
 * failures are not hypothetical: an earlier scoring version of this matcher
 * collapsed twelve distinct units of one new building into a single property, and
 * the test that would have caught it is `newBuildingUnitsStayApart`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  areaBucket,
  normalizeAddress,
  propertyFingerprint,
  propertyMatch,
  type MatchCandidate,
  type MatchSubject,
} from './fingerprint';

function subject(over: Partial<MatchSubject> = {}): MatchSubject {
  return {
    districtSlug: 'lince',
    addressNorm: normalizeAddress('Jr. Pedro Conde 500'),
    bedrooms: 1,
    area: 50,
    latitude: -12.0865,
    longitude: -77.0365,
    pricePen: 227_500,
    ...over,
  };
}

function candidate(over: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    districtSlug: 'lince',
    addressNorm: normalizeAddress('Calle Pedro Conde al 500'),
    bedrooms: 1,
    areaM2: 50,
    latitude: -12.0865,
    longitude: -77.0365,
    pricePen: 235_000,
    ...over,
  };
}

describe('normalizeAddress', () => {
  it('collapses street-type words, accents and filler', () => {
    assert.equal(normalizeAddress('Av. Arequipa al 1900'), normalizeAddress('Avenida Arequipa 1900'));
    assert.equal(normalizeAddress('Jirón Pedro Conde 178'), 'pedro conde 178');
    assert.equal(normalizeAddress('Av. César Vallejo 1445'), normalizeAddress('Av Cesar Vallejo 1445'));
  });

  it('returns null for nothing usable', () => {
    assert.equal(normalizeAddress(null), null);
    assert.equal(normalizeAddress('   '), null);
    assert.equal(normalizeAddress('Av.'), null);
  });
});

describe('areaBucket', () => {
  it('rounds to the nearest bucket and rejects nonsense', () => {
    assert.equal(areaBucket(64), 65);
    assert.equal(areaBucket(62), 60);
    assert.equal(areaBucket(0), null);
    assert.equal(areaBucket(null), null);
  });
});

describe('propertyFingerprint', () => {
  it('is stable across address spellings', () => {
    const a = propertyFingerprint({ districtSlug: 'lince', address: 'Av. César Vallejo 1445', bedrooms: 2, area: 62 });
    const b = propertyFingerprint({ districtSlug: 'lince', address: 'Av Cesar Vallejo 1445', bedrooms: 2, area: 61 });
    assert.equal(a, b);
  });

  it('marks missing parts instead of dropping them', () => {
    const fp = propertyFingerprint({ districtSlug: 'lince', address: null, bedrooms: null, area: null });
    assert.equal(fp, 'lince|?|?|?');
  });
});

describe('propertyMatch', () => {
  it('merges one apartment listed by two brokers', () => {
    // 150232623 and 149863194: same door, same area, 3.3% apart on price.
    assert.equal(propertyMatch(subject(), candidate()).same, true);
  });

  it('newBuildingUnitsStayApart', () => {
    // Seven 2-bedroom units of a new building on Villavicencio, all listing the
    // street with no number, all at the same coordinates, 52-59 m², 494k-535k.
    // Every individual signal says "same"; they are seven apartments.
    const street = normalizeAddress('Jr. Comandante Manuel Villavicencio');
    const unitA = subject({ addressNorm: street, bedrooms: 2, area: 52, pricePen: 494_000 });
    const unitB = candidate({ addressNorm: street, bedrooms: 2, areaM2: 53, pricePen: 506_000 });
    assert.equal(propertyMatch(unitA, unitB).same, false);
  });

  it('keeps different units of the same numbered building apart by area', () => {
    // 149495426 (73 m²) and 149501929 (77 m²) both at Casanova 568.
    const address = normalizeAddress('Jr. Coronel Domingo Casanova 568');
    const a = subject({ addressNorm: address, bedrooms: 3, area: 73, pricePen: 593_865 });
    const b = candidate({ addressNorm: address, bedrooms: 3, areaM2: 77, pricePen: 596_650 });
    assert.equal(propertyMatch(a, b).same, false);
  });

  it('keeps unit ranges of one project apart', () => {
    // The developer publishes "Dpto. 205 AL 505" and "Dpto. 504 AL 904" as two
    // listings; they are different stacks of units.
    const a = subject({ addressNorm: normalizeAddress('Jirón Domingo Casanova N° 5xx, Dpto. 205 AL 505'), bedrooms: 3, area: 73 });
    const b = candidate({ addressNorm: normalizeAddress('Jirón Domingo Casanova N° 5xx, Dpto. 504 AL 904'), bedrooms: 3, areaM2: 73 });
    assert.equal(propertyMatch(a, b).same, false);
  });

  it('refuses to match on a street without a number', () => {
    const street = normalizeAddress('Avenida Arenales');
    const a = subject({ addressNorm: street, area: 65, pricePen: 472_300 });
    const b = candidate({ addressNorm: street, areaM2: 65, pricePen: 472_300 });
    assert.equal(propertyMatch(a, b).same, false);
  });

  it('refuses to match when either address is missing', () => {
    assert.equal(propertyMatch(subject({ addressNorm: null }), candidate()).same, false);
    assert.equal(propertyMatch(subject(), candidate({ addressNorm: null })).same, false);
  });

  it('never crosses districts', () => {
    assert.equal(propertyMatch(subject(), candidate({ districtSlug: 'jesus-maria' })).same, false);
  });

  it('rejects a price gap too wide for two brokers on one apartment', () => {
    assert.equal(propertyMatch(subject({ pricePen: 250_000 }), candidate({ pricePen: 419_000 })).same, false);
  });

  it('rejects a bedroom disagreement', () => {
    assert.equal(propertyMatch(subject({ bedrooms: 1 }), candidate({ bedrooms: 3 })).same, false);
  });

  it('rejects coordinates in a different building', () => {
    assert.equal(propertyMatch(subject(), candidate({ latitude: -12.1, longitude: -77.05 })).same, false);
  });

  it('still matches when one side omits area or price', () => {
    assert.equal(propertyMatch(subject({ area: null }), candidate()).same, true);
    assert.equal(propertyMatch(subject({ pricePen: null }), candidate()).same, true);
  });

  it('tolerates a differently spelled but overlapping address', () => {
    // 150176828 "Av. Prol. Iquitos 1570 al 1500" and 149802441 "AV Iquitos 1570".
    const a = subject({ addressNorm: normalizeAddress('Av. Prol. Iquitos 1570 al 1500'), bedrooms: 3, area: 75, pricePen: 424_620 });
    const b = candidate({ addressNorm: normalizeAddress('AV Iquitos 1570'), bedrooms: 3, areaM2: 75, pricePen: 430_290 });
    assert.equal(propertyMatch(a, b).same, true);
  });

  it('prefers the closest candidate when several qualify', () => {
    const near = propertyMatch(subject(), candidate({ pricePen: 228_000, areaM2: 50 }));
    const far = propertyMatch(subject(), candidate({ pricePen: 235_000, areaM2: 51 }));
    assert.equal(near.same && far.same, true);
    assert.ok(near.closeness > far.closeness);
  });
});
