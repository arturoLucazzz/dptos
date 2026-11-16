import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideProperty, nameNorm, streetNorm } from './dedupe';
import {
  dedupeSideFromCard,
  dedupeSideFromProperty,
  keysToFill,
  titleNorm,
  unitNorm,
  type DedupePropertyRow,
} from './dedupe-side';
import { normalizeAddress } from './fingerprint';
import type { ListingCard } from './listing-card';
import { validateManualListing } from './manual-listing';
import { toPen } from './money';
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
    unitNumber: null,
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
    projectId: null,
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

  it('collects the unit of the key and of every posting, and the project', () => {
    const side = dedupeSideFromProperty({
      ...property([
        { source: 'urbania', removedAt: null, currentSnapshot: snapshot() },
        { source: 'manual', removedAt: null, currentSnapshot: snapshot({ unitNumber: ' 1202 ' }) },
        { source: 'proper', removedAt: new Date(), currentSnapshot: snapshot({ unitNumber: '301' }) },
      ]),
      projectId: 'proj1',
    });
    assert.deepEqual(side.unitNumbers, ['301', '1202']);
    assert.deepEqual(side.projectIds, ['proj1']);
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
    assert.deepEqual(side.unitNumbers, ['301']);
    assert.deepEqual(side.projectIds, []);
    assert.equal(side.streetNorm, 'pedro conde');
    assert.deepEqual(side.sources, ['proper']);
    assert.equal(side.areaM2, 70);
    assert.equal(side.addressIsBlock, false);
    assert.equal(dedupeSideFromCard(emptyCard('urbania', { address: 'Pedro Conde al 500' }), 'lince', null).addressIsBlock, true);
  });
});

describe('keysToFill', () => {
  const empty = { unitNumber: null, buildingNorm: null, streetNorm: null, projectId: null };

  it('fills only the keys the property lacks', () => {
    const fill = keysToFill(
      { ...empty, buildingNorm: 'mirador' },
      { unitNumber: '1202', buildingNorm: 'otro', streetNorm: 'pedro conde', projectId: 'p1' }
    );
    assert.deepEqual(fill, { unitNumber: '1202', streetNorm: 'pedro conde', projectId: 'p1' });
  });

  it('never overwrites and returns nothing when nothing is new', () => {
    const full = { unitNumber: '1', buildingNorm: 'a', streetNorm: 'b', projectId: 'c' };
    assert.deepEqual(keysToFill(full, { unitNumber: '2', buildingNorm: 'x', streetNorm: 'y', projectId: 'z' }), {});
    assert.deepEqual(keysToFill(empty, empty), {});
  });
});

/**
 * The ingest sequence without a database: each card is decided against the
 * properties so far, as resolveUnitProperty does, and a new property or an
 * attach (with its key fill) is applied to the list.
 */
describe('ingest decisions', () => {
  interface Stored {
    row: DedupePropertyRow;
  }

  function keysOf(card: ListingCard, projectId: string | null) {
    return {
      unitNumber: unitNorm(card.unitNumber),
      buildingNorm: nameNorm(card.buildingName),
      streetNorm: streetNorm(card.address),
      projectId,
    };
  }

  function postingOf(card: ListingCard): DedupePropertyRow['postings'][number] {
    return {
      source: card.source,
      removedAt: null,
      currentSnapshot: snapshot({
        title: card.title,
        address: card.address,
        pricePen: toPen(card.priceAmount, card.priceCurrency) as never,
        areaTotal: card.areaTotal as never,
        bedrooms: card.bedrooms,
        developerName: card.developerName,
        unitNumber: card.unitNumber,
      }),
    };
  }

  function ingest(stored: Stored[], card: ListingCard, projectId: string | null = null): string {
    const subject = dedupeSideFromCard(card, 'lince', toPen(card.priceAmount, card.priceCurrency), projectId);
    const decision = decideProperty(subject, stored.map(({ row }) => dedupeSideFromProperty(row)));
    const keys = keysOf(card, projectId);
    if (decision.attachTo) {
      const target = stored.find(({ row }) => row.id === decision.attachTo)!;
      target.row = { ...target.row, ...keysToFill(target.row, keys), postings: [...target.row.postings, postingOf(card)] };
      return target.row.id;
    }
    const id = `p${stored.length + 1}`;
    stored.push({
      row: {
        id,
        districtSlug: 'lince',
        addressNorm: normalizeAddress(card.address),
        bedrooms: card.bedrooms,
        latitude: null,
        longitude: null,
        ...keys,
        postings: [postingOf(card)],
      },
    });
    return id;
  }

  it('two rows of one manual project without unit numbers are two properties', () => {
    const result = validateManualListing(
      {
        project: { name: 'Torre Sol', district: 'Lince', address: 'Av. Pedro Conde 123' },
        units: [
          { price: '300000', currency: 'USD', bedrooms: '2', area: '70' },
          { price: '300000', currency: 'USD', bedrooms: '2', area: '70' },
        ],
      },
      (() => {
        let n = 0;
        return () => `id${++n}`;
      })()
    );
    assert.ok(result.ok);
    const units = result.cards.filter((card) => card.kind === 'UNIT');
    assert.equal(units.length, 2);

    const stored: Stored[] = [];
    const first = ingest(stored, units[0], 'project-torre-sol');
    const second = ingest(stored, units[1], 'project-torre-sol');
    assert.notEqual(first, second);
    assert.equal(stored.length, 2);
  });

  it('manual 1202 then 1302 against one Urbania property: only the first attaches', () => {
    const shared = { address: 'Av. Pedro Conde 123', bedrooms: 2, areaTotal: 70, priceAmount: 300000, priceCurrency: 'USD' as const };
    const stored: Stored[] = [];
    const urbania = ingest(stored, emptyCard('urbania', { ...shared, sourcePostingId: 'u1' }));

    const manual = (unit: string, id: string) =>
      emptyCard('manual', { ...shared, sourcePostingId: id, unitNumber: unit });

    assert.equal(ingest(stored, manual('1202', 'm1')), urbania);
    // The attach taught the property its unit.
    assert.equal(stored[0].row.unitNumber, '1202');

    const other = ingest(stored, manual('1302', 'm2'));
    assert.notEqual(other, urbania);
    assert.equal(stored.length, 2);
  });

  it('the unit of an attached copy vetoes another unit even without the key fill', () => {
    const shared = { address: 'Av. Pedro Conde 123', bedrooms: 2, areaTotal: 70, priceAmount: 300000, priceCurrency: 'USD' as const };
    const urbaniaPosting = postingOf(emptyCard('urbania', shared));
    const manualPosting = postingOf(emptyCard('manual', { ...shared, unitNumber: '1202' }));
    const row: DedupePropertyRow = {
      id: 'p1',
      districtSlug: 'lince',
      addressNorm: normalizeAddress(shared.address),
      streetNorm: 'pedro conde',
      buildingNorm: null,
      unitNumber: null,
      projectId: null,
      bedrooms: 2,
      latitude: null,
      longitude: null,
      postings: [urbaniaPosting, manualPosting],
    };
    const card = emptyCard('manual', { ...shared, unitNumber: '1302' });
    const decision = decideProperty(dedupeSideFromCard(card, 'lince', toPen(300000, 'USD')), [dedupeSideFromProperty(row)]);
    assert.equal(decision.attachTo, null);

    const same = emptyCard('adondevivir', { ...shared, unitNumber: '1202' });
    assert.equal(decideProperty(dedupeSideFromCard(same, 'lince', toPen(300000, 'USD')), [dedupeSideFromProperty(row)]).attachTo, 'p1');
  });
});
