import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupeSideFromCard, dedupeSideFromProperty, titleNorm, type DedupePropertyRow } from './dedupe-side';
import { emptyCard } from './listing-card';

function snapshot(over: Partial<NonNullable<DedupePropertyRow['postings'][number]['currentSnapshot']>> = {}) {
  return {
    title: null,
    address: null,
    pricePen: null,
    areaTotal: null,
    areaCovered: null,
    bedrooms: null,
    latitude: null,
    longitude: null,
    developerName: null,
    ...over,
  } as NonNullable<DedupePropertyRow['postings'][number]['currentSnapshot']>;
}

function property(postings: DedupePropertyRow['postings']): DedupePropertyRow {
  return {
    id: 'p1',
    districtSlug: 'lince',
    addressNorm: 'pedro conde 123',
    streetNorm: null,
    buildingNorm: 'mirador',
    unitNumber: '301',
    bedrooms: 2,
    latitude: null,
    longitude: null,
    postings,
  };
}

describe('titleNorm', () => {
  it('lowercases, drops accents and collapses spaces', () => {
    assert.equal(titleNorm('  Depa  en  JESÚS María '), 'depa en jesus maria');
    assert.equal(titleNorm('   '), null);
  });
});

describe('dedupeSideFromProperty', () => {
  it('reads the snapshot of the newest live posting and every source', () => {
    const side = dedupeSideFromProperty(
      property([
        { source: 'adondevivir', removedAt: new Date(), currentSnapshot: snapshot({ title: 'Removed', pricePen: 1 as never }) },
        {
          source: 'urbania',
          removedAt: null,
          currentSnapshot: snapshot({ title: 'Depa Lince', pricePen: 399000 as never, areaCovered: 65 as never, developerName: 'Edificio Altea' }),
        },
      ])
    );
    assert.deepEqual(side.sources, ['adondevivir', 'urbania']);
    assert.equal(side.titleNorm, 'depa lince');
    assert.equal(side.pricePen, 399000);
    assert.equal(side.areaM2, 65);
    assert.equal(side.developerNorm, 'altea');
    assert.equal(side.streetNorm, 'pedro conde');
    assert.equal(side.bedrooms, 2);
    assert.equal(side.addressIsBlock, false);
  });

  it('reads block wording from the snapshot address', () => {
    const side = dedupeSideFromProperty(
      property([{ source: 'urbania', removedAt: null, currentSnapshot: snapshot({ address: 'Pedro Conde  al 500' }) }])
    );
    assert.equal(side.addressIsBlock, true);
  });

  it('falls back to a removed posting when none is live', () => {
    const side = dedupeSideFromProperty(
      property([{ source: 'urbania', removedAt: new Date(), currentSnapshot: snapshot({ pricePen: 5 as never }) }])
    );
    assert.equal(side.pricePen, 5);
  });
});

describe('dedupeSideFromCard', () => {
  it('normalizes the building, unit and address keys', () => {
    const card = emptyCard('proper', {
      address: 'Av. Pedro Conde 123',
      buildingName: 'Edificio Mirador',
      unitNumber: ' 301 ',
      areaTotal: 70,
      bedrooms: 2,
    });
    const side = dedupeSideFromCard(card, 'lince', 400000);
    assert.equal(side.buildingNorm, 'mirador');
    assert.equal(side.unitNumber, '301');
    assert.equal(side.streetNorm, 'pedro conde');
    assert.deepEqual(side.sources, ['proper']);
    assert.equal(side.areaM2, 70);
    assert.equal(side.addressIsBlock, false);
    assert.equal(dedupeSideFromCard(emptyCard('urbania', { address: 'Pedro Conde al 500' }), 'lince', null).addressIsBlock, true);
  });
});
