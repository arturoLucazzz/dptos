import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collapseCopies, postingUrl, type CopyInput } from './official-price';

function copy(over: Partial<CopyInput> & Pick<CopyInput, 'postingId' | 'pricePen'>): CopyInput {
  return { propertyId: 'P', source: 'urbania', url: null, ...over };
}

describe('collapseCopies', () => {
  it('lowest price is official', () => {
    const groups = collapseCopies([
      copy({ postingId: 'u1', source: 'urbania', pricePen: 420_000, url: 'https://urbania.pe/x' }),
      copy({ postingId: 'r1', source: 'remax', pricePen: 399_000, url: 'https://remax.pe/y' }),
      copy({ postingId: 'p1', source: 'proper', pricePen: 410_000 }),
    ]);
    assert.deepEqual([...groups.keys()], ['r1']);
    const group = groups.get('r1')!;
    assert.equal(group.priceMaxPen, 420_000);
    assert.deepEqual(group.copies, [
      { source: 'remax', url: 'https://remax.pe/y', pricePen: 399_000 },
      { source: 'proper', url: null, pricePen: 410_000 },
      { source: 'urbania', url: 'https://urbania.pe/x', pricePen: 420_000 },
    ]);
  });

  it('tie picks the smaller posting id', () => {
    const groups = collapseCopies([
      copy({ postingId: 'b', source: 'urbania', pricePen: 400_000 }),
      copy({ postingId: 'a', source: 'adondevivir', pricePen: 400_000 }),
    ]);
    assert.deepEqual([...groups.keys()], ['a']);
    assert.equal(groups.get('a')!.copies.length, 2);
  });

  it('no property means its own row', () => {
    const groups = collapseCopies([
      copy({ postingId: 'x', propertyId: null, pricePen: 300_000 }),
      copy({ postingId: 'y', propertyId: null, pricePen: 300_000 }),
      copy({ postingId: 'z', propertyId: 'Q', pricePen: 500_000 }),
    ]);
    assert.deepEqual([...groups.keys()].sort(), ['x', 'y', 'z']);
    assert.equal(groups.get('x')!.copies.length, 1);
    assert.equal(groups.get('x')!.priceMaxPen, 300_000);
  });
});

describe('postingUrl', () => {
  it('urbania url from path', () => assert.equal(postingUrl('urbania', '/inmueble/x-1', null), 'https://urbania.pe/inmueble/x-1'));

  it('prefers the stored source url', () => {
    assert.equal(postingUrl('urbania', '/inmueble/x-1', 'https://urbania.pe/other'), 'https://urbania.pe/other');
    assert.equal(postingUrl('remax', null, 'https://remax.pe/p/1'), 'https://remax.pe/p/1');
  });

  it('other sources without a url have none', () => {
    assert.equal(postingUrl('proper', '/x', null), null);
  });
});
