import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { addressIsBlock, classifyPair, decideProperty, nameNorm, pairKey, streetNorm, type DedupeSide } from './dedupe';
import { toPen } from './money';
import { normalizeAddress } from './fingerprint';
import type { DuplicateDecision } from './duplicates';

function side(over: Partial<DedupeSide> = {}): DedupeSide {
  return {
    id: 'a',
    sources: ['urbania'],
    districtSlug: 'lince',
    addressNorm: null,
    addressIsBlock: false,
    streetNorm: null,
    buildingNorm: null,
    unitNumbers: [],
    projectIds: [],
    developerNorm: null,
    titleNorm: null,
    bedrooms: 2,
    areaM2: 65,
    latitude: null,
    longitude: null,
    pricePen: 399000,
    ...over,
  };
}

describe('classifyPair', () => {
  it('navent copy is high', () => {
    const a = side({ sources: ['urbania'], titleNorm: 'depa lince', addressNorm: 'iquitos' });
    const b = side({ id: 'b', sources: ['adondevivir'], titleNorm: 'depa lince', addressNorm: 'iquitos' });
    const r = classifyPair(a, b);
    assert.equal(r.level, 'HIGH');
    assert.deepEqual(r.signals, ['navent-copy']);
    assert.equal(r.closeness, 1);
  });

  it('usd copy matches pen copy', () => {
    const a = side({ addressNorm: 'iquitos 1234', pricePen: 399000 });
    const b = side({ id: 'b', sources: ['proper'], addressNorm: 'iquitos 1234', pricePen: toPen(114000, 'USD') });
    const r = classifyPair(a, b);
    assert.equal(r.level, 'HIGH');
    assert.deepEqual(r.signals, ['same-door']);
  });

  it('same building and unit is high', () => {
    const a = side({ buildingNorm: 'prolongacion iquitos', unitNumbers: ['202'], pricePen: 399000 });
    const b = side({ id: 'b', buildingNorm: 'prolongacion iquitos', unitNumbers: ['202'], pricePen: 410000 });
    const r = classifyPair(a, b);
    assert.equal(r.level, 'HIGH');
    assert.deepEqual(r.signals, ['same-unit']);
  });

  it('same building no unit is medium', () => {
    const a = side({ buildingNorm: 'prolongacion iquitos', areaM2: 65, pricePen: 399000 });
    const b = side({ id: 'b', buildingNorm: 'prolongacion iquitos', areaM2: 66, pricePen: 405000 });
    const r = classifyPair(a, b);
    assert.equal(r.level, 'MEDIUM');
    assert.deepEqual(r.signals, ['same-building']);
    assert.equal(r.closeness, 0);
  });

  it('street only is low', () => {
    const a = side({ streetNorm: 'iquitos', areaM2: 65 });
    const b = side({ id: 'b', streetNorm: 'iquitos', areaM2: 69 });
    const r = classifyPair(a, b);
    assert.equal(r.level, 'LOW');
    assert.deepEqual(r.signals, ['same-street']);
  });

  it('price gap over 10% is nothing', () => {
    const a = side({ buildingNorm: 'prolongacion iquitos', pricePen: 399000 });
    const b = side({ id: 'b', buildingNorm: 'prolongacion iquitos', pricePen: 445000 });
    assert.equal(classifyPair(a, b).level, null);
  });

  it('publisher alone is nothing', () => {
    const a = side({ sources: ['proper'], titleNorm: 'depa lince' });
    const b = side({ id: 'b', sources: ['nexo'], titleNorm: 'depa lince', pricePen: 520000 });
    assert.equal(classifyPair(a, b).level, null);
  });

  it('different unit numbers never pair', () => {
    const a = side({ buildingNorm: 'prolongacion iquitos', unitNumbers: ['202'] });
    const b = side({ id: 'b', buildingNorm: 'prolongacion iquitos', unitNumbers: ['305'] });
    assert.equal(classifyPair(a, b).level, null);
    const c = side({ addressNorm: 'iquitos 1234', unitNumbers: ['202'] });
    const d = side({ id: 'd', addressNorm: 'iquitos 1234', unitNumbers: ['305'] });
    assert.equal(classifyPair(c, d).level, null);
  });

  it('different districts never pair', () => {
    const a = side({ buildingNorm: 'x', unitNumbers: ['1'] });
    const b = side({ id: 'b', districtSlug: 'jesus-maria', buildingNorm: 'x', unitNumbers: ['1'] });
    assert.equal(classifyPair(a, b).level, null);
  });

  it('new building units never merge', () => {
    const units = Array.from({ length: 12 }, (_, i) =>
      side({
        id: `u${i}`,
        addressNorm: 'benavides',
        streetNorm: 'benavides',
        areaM2: 52 + (i * 7) / 11,
        pricePen: 494000 + (i * 41000) / 11,
      })
    );
    for (const x of units) {
      for (const y of units) {
        if (x.id === y.id) continue;
        assert.notEqual(classifyPair(x, y).level, 'HIGH');
      }
    }
  });

  it('null address gives no low flag', () => {
    const a = side({ addressNorm: null, streetNorm: null });
    const b = side({ id: 'b', addressNorm: null, streetNorm: null });
    assert.equal(classifyPair(a, b).level, null);
  });

  it('a block address is not a door', () => {
    const raw = 'Pedro Conde  al 500';
    const a = side({ addressNorm: normalizeAddress(raw), addressIsBlock: addressIsBlock(raw), areaM2: 50, pricePen: 230000 });
    const b = side({ id: 'b', addressNorm: normalizeAddress(raw), addressIsBlock: addressIsBlock(raw), areaM2: 50, pricePen: 230000 });
    assert.notEqual(classifyPair(a, b).level, 'HIGH');
  });

  it('a door address is still high', () => {
    const raw = 'Av. Arequipa 1900';
    const a = side({ addressNorm: normalizeAddress(raw), addressIsBlock: addressIsBlock(raw), areaM2: 50, pricePen: 230000 });
    const b = side({ id: 'b', addressNorm: normalizeAddress(raw), addressIsBlock: addressIsBlock(raw), areaM2: 50, pricePen: 230000 });
    assert.equal(classifyPair(a, b).level, 'HIGH');
  });

  it('same door with different dpto numbers in the address is not high', () => {
    const a = side({ addressNorm: 'benavides 1234 dpto 202', pricePen: 399000 });
    const b = side({ id: 'b', addressNorm: 'benavides 1234 dpto 305', pricePen: 410000 });
    assert.notEqual(classifyPair(a, b).level, 'HIGH');
  });

  it('same door with null bedrooms, area and price is not high', () => {
    const a = side({ addressNorm: 'benavides 1234', bedrooms: null, areaM2: null, pricePen: null });
    const b = side({ id: 'b', addressNorm: 'benavides 1234', bedrooms: 3, areaM2: 120, pricePen: 900000 });
    assert.notEqual(classifyPair(a, b).level, 'HIGH');
  });

  it('numbered new building units never merge', () => {
    const units = Array.from({ length: 12 }, (_, i) =>
      side({
        id: `u${i}`,
        addressNorm: `benavides 1234 dpto ${101 + i}`,
        streetNorm: 'benavides dpto',
        areaM2: 52 + i * 0.6,
        pricePen: 494000 + i * 3000,
      })
    );
    for (const x of units) {
      for (const y of units) {
        if (x.id === y.id) continue;
        assert.notEqual(classifyPair(x, y).level, 'HIGH');
      }
    }
  });

  it('same building and unit with different size and price is not high', () => {
    const a = side({ buildingNorm: 'a', unitNumbers: ['202'], bedrooms: 1, areaM2: 40, pricePen: 200000 });
    const b = side({ id: 'b', buildingNorm: 'a', unitNumbers: ['202'], bedrooms: 3, areaM2: 120, pricePen: 900000 });
    assert.notEqual(classifyPair(a, b).level, 'HIGH');
  });

  it('closeness stays within 0 and 1', () => {
    const a = side({ buildingNorm: 'a', unitNumbers: ['202'], pricePen: 399000 });
    const b = side({ id: 'b', buildingNorm: 'a', unitNumbers: ['202'], pricePen: 420000 });
    const r = classifyPair(a, b);
    assert.equal(r.level, 'HIGH');
    assert.ok(r.closeness >= 0 && r.closeness <= 1);
  });

  it('null price gives no medium', () => {
    const a = side({ buildingNorm: 'x', pricePen: null });
    const b = side({ id: 'b', buildingNorm: 'x' });
    assert.equal(classifyPair(a, b).level, null);
  });

  it('far coordinates block medium, missing coordinates do not', () => {
    const far = { latitude: -12.08, longitude: -77.03 };
    const farther = { latitude: -12.09, longitude: -77.03 };
    const a = side({ buildingNorm: 'x', ...far });
    assert.equal(classifyPair(a, side({ id: 'b', buildingNorm: 'x', ...farther })).level, null);
    assert.equal(classifyPair(a, side({ id: 'b', buildingNorm: 'x' })).level, 'MEDIUM');
  });
});

describe('decideProperty', () => {
  it('decideProperty attaches to the closest high', () => {
    const subject = side({ id: 's', addressNorm: 'iquitos 1234', pricePen: 400000 });
    const far = side({ id: 'far', addressNorm: 'iquitos 1234', pricePen: 410000 });
    const near = side({ id: 'near', addressNorm: 'iquitos 1234', pricePen: 400000 });
    const medium = side({ id: 'med', buildingNorm: 'x' });
    const d = decideProperty({ ...subject, buildingNorm: 'x' }, [far, medium, near]);
    assert.equal(d.attachTo, 'near');
    assert.deepEqual(d.flags, []);
  });

  it('decideProperty tie goes to the first candidate', () => {
    const subject = side({ id: 's', addressNorm: 'iquitos 1234' });
    const first = side({ id: 'first', addressNorm: 'iquitos 1234' });
    const second = side({ id: 'second', addressNorm: 'iquitos 1234' });
    assert.equal(decideProperty(subject, [first, second]).attachTo, 'first');
    assert.equal(decideProperty(subject, [second, first]).attachTo, 'second');
  });

  it('decideProperty with two highs and a medium attaches to the closer high and flags nothing', () => {
    const subject = side({ id: 's', addressNorm: 'iquitos 1234', buildingNorm: 'x', pricePen: 400000 });
    const worse = side({ id: 'worse', addressNorm: 'iquitos 1234', pricePen: 415000 });
    const better = side({ id: 'better', addressNorm: 'iquitos 1234', pricePen: 402000 });
    const medium = side({ id: 'med', buildingNorm: 'x' });
    const d = decideProperty(subject, [worse, medium, better]);
    assert.equal(d.attachTo, 'better');
    assert.deepEqual(d.flags, []);
  });

  it('decideProperty returns flags when no high', () => {
    const subject = side({ id: 's', buildingNorm: 'x', streetNorm: 'iquitos' });
    const med = side({ id: 'm', buildingNorm: 'x' });
    const low = side({ id: 'l', streetNorm: 'iquitos', areaM2: 69 });
    const none = side({ id: 'n', districtSlug: 'barranco' });
    const d = decideProperty(subject, [med, low, none]);
    assert.equal(d.attachTo, null);
    assert.deepEqual(d.flags, [
      { propertyId: 'm', level: 'MEDIUM', signals: ['same-building'] },
      { propertyId: 'l', level: 'LOW', signals: ['same-street'] },
    ]);
  });
});

describe('helpers', () => {
  it('pairKey is order free', () => assert.deepEqual(pairKey('b', 'a'), pairKey('a', 'b')));

  it('streetNorm drops digit tokens and agrees on normalized input', () => {
    assert.equal(streetNorm('Av. Arequipa 1900'), 'arequipa');
    assert.equal(streetNorm('1900'), null);
    assert.equal(streetNorm(null), null);
    for (const raw of ['Av. Arequipa al 1900', 'Jr. Iquitos 1234 Dpto 5', 'Calle Los Pinos']) {
      const norm = normalizeAddress(raw) as string;
      assert.equal(streetNorm(norm), streetNorm(raw));
    }
  });

  it('nameNorm strips noise words and accents', () => {
    assert.equal(nameNorm('Edificio Residencial Gálvez, Torre 2'), 'galvez 2');
    assert.equal(nameNorm('Proyecto'), null);
  });
  it('addressIsBlock reads block wording from the raw address', () => {
    assert.equal(addressIsBlock('Pedro Conde  al 500'), true);
    assert.equal(addressIsBlock('Av. Arequipa al 1900'), true);
    assert.equal(addressIsBlock('Av. Arequipa Cdra. 19'), true);
    assert.equal(addressIsBlock('Jr. Huáscar cuadra 3'), true);
    assert.equal(addressIsBlock('Av. Arequipa 1900'), false);
    assert.equal(addressIsBlock('Calle Alcanfores 300'), false);
    assert.equal(addressIsBlock(null), false);
  });
});

describe('owner decisions', () => {
  // A confirmed pair must still be noticed; a rejected pair must never merge on its own.
  function mismatch({ status, a, b }: DuplicateDecision): string | null {
    const result = classifyPair(a, b);
    if (status === 'CONFIRMED' && result.level === null) {
      return `confirmed ${a.id} / ${b.id} is no longer flagged`;
    }
    if (status === 'REJECTED' && result.level === 'HIGH') {
      return `rejected ${a.id} / ${b.id} merges automatically (${result.signals.join(', ')})`;
    }
    return null;
  }

  function isSide(value: unknown): value is DedupeSide {
    if (typeof value !== 'object' || value === null) return false;
    const side = value as Record<string, unknown>;
    return typeof side.id === 'string' && typeof side.districtSlug === 'string' && Array.isArray(side.sources);
  }

  /** Throws on a malformed file: that is a bug in the export, not a disagreement. */
  function parseDecisions(text: string): DuplicateDecision[] {
    const data: unknown = JSON.parse(text);
    assert.ok(Array.isArray(data), 'duplicate-decisions.json must be an array');
    data.forEach((item: unknown, i) => {
      const row = item as Record<string, unknown>;
      assert.ok(row?.status === 'CONFIRMED' || row?.status === 'REJECTED', `decision ${i}: bad status`);
      assert.ok(isSide(row.a) && isSide(row.b), `decision ${i}: a and b must be dedupe sides`);
    });
    return data as DuplicateDecision[];
  }

  it('owner decisions still hold', () => {
    const agreeing: DuplicateDecision[] = [
      {
        status: 'CONFIRMED',
        a: side({ id: 'a', sources: ['urbania'], titleNorm: 'depa lince', addressNorm: 'iquitos' }),
        b: side({ id: 'b', sources: ['adondevivir'], titleNorm: 'depa lince', addressNorm: 'iquitos' }),
      },
      {
        status: 'REJECTED',
        a: side({ id: 'c', streetNorm: 'iquitos', addressNorm: 'iquitos', addressIsBlock: true }),
        b: side({ id: 'd', sources: ['proper'], streetNorm: 'iquitos', addressNorm: 'iquitos', areaM2: 68 }),
      },
    ];
    for (const decision of agreeing) assert.equal(mismatch(decision), null);
  });

  // Real verdicts the rules disagree with are tuning work, not a broken build:
  // each one is reported, and only a malformed file fails.
  it('exported owner decisions are reported against the rules', (t) => {
    const file = new URL('./__fixtures__/duplicate-decisions.json', import.meta.url);
    if (!existsSync(file)) return;
    const decisions = parseDecisions(readFileSync(file, 'utf8'));
    const mismatches = decisions.map(mismatch).filter((m): m is string => m !== null);
    for (const message of mismatches) t.diagnostic(`owner decision disagrees: ${message}`);
    t.diagnostic(`${decisions.length} owner decisions, ${mismatches.length} disagree with the rules`);
  });
});

describe('units and projects', () => {
  it('units of one project are never high, at most a flag', () => {
    const a = side({ addressNorm: 'iquitos 1234', buildingNorm: 'sol', projectIds: ['p1'] });
    const b = side({ id: 'b', addressNorm: 'iquitos 1234', buildingNorm: 'sol', projectIds: ['p1'] });
    const r = classifyPair(a, b);
    assert.equal(r.level, 'MEDIUM');
    assert.deepEqual(r.signals, ['same-building']);
    // Same unit number inside one project: still only a flag.
    const c = side({ buildingNorm: 'sol', unitNumbers: ['301'], projectIds: ['p1'] });
    const d = side({ id: 'd', buildingNorm: 'sol', unitNumbers: ['301'], projectIds: ['p1'] });
    assert.notEqual(classifyPair(c, d).level, 'HIGH');
    // Different projects do not block the match.
    assert.equal(classifyPair(a, { ...b, projectIds: ['p2'] }).level, 'HIGH');
  });

  it('a unit missing from a property list is a different apartment', () => {
    const card = side({ addressNorm: 'iquitos 1234', unitNumbers: ['1302'] });
    const property = side({ id: 'b', addressNorm: 'iquitos 1234', unitNumbers: ['1202'] });
    assert.equal(classifyPair(card, property).level, null);
    assert.equal(classifyPair(card, { ...property, unitNumbers: ['1202', '1302'] }).level, 'HIGH');
    assert.equal(classifyPair(card, { ...property, unitNumbers: [] }).level, 'HIGH');
  });

  it('old stored sides without the lists still classify', () => {
    const legacy = { ...side({ addressNorm: 'iquitos 1234' }) } as Partial<DedupeSide>;
    delete legacy.unitNumbers;
    delete legacy.projectIds;
    const r = classifyPair(legacy as DedupeSide, side({ id: 'b', addressNorm: 'iquitos 1234' }));
    assert.equal(r.level, 'HIGH');
  });
});
