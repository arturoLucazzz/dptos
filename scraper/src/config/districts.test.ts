import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { districtSlugFromName } from './districts';

describe('districts', () => {
  it('districtSlugFromName', () => {
    assert.equal(districtSlugFromName('Jesús María'), 'jesus-maria');
    assert.equal(districtSlugFromName('jesus maria'), 'jesus-maria');
    assert.equal(districtSlugFromName('Santiago de Surco'), 'santiago-de-surco');
    assert.equal(districtSlugFromName('Surco'), 'santiago-de-surco');
    assert.equal(districtSlugFromName('Magdalena del Mar'), 'magdalena');
    assert.equal(districtSlugFromName('Cercado de Lima'), null);
    assert.equal(districtSlugFromName(''), null);
  });
});
