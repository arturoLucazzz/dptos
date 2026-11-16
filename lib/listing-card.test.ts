import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyCard, fromUrbaniaCard } from './listing-card';

describe('listing-card', () => {
  it('emptyCard fills nulls', () => {
    const c = emptyCard('proper', { priceAmount: 280000 });
    assert.equal(c.source, 'proper');
    assert.equal(c.address, null);
    assert.deepEqual(c.imageUrls, []);
    assert.equal(c.priceAmount, 280000);
  });
  it('fromUrbaniaCard keeps the image', () => {
    const c = fromUrbaniaCard({ ...emptyCard('urbania', {}), imageUrl: 'https://x/1.jpg' }, 'adondevivir', 'lince');
    assert.deepEqual(c.imageUrls, ['https://x/1.jpg']);
    assert.equal(c.source, 'adondevivir');
  });
});
