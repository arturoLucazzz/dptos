import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gateSkips, previousCountFrom } from './sanity-gate';

describe('previousCountFrom', () => {
  it('reads the new shape', () => {
    assert.equal(previousCountFrom({ remax: { lince: { SALE: 40 } } }, 'remax', 'lince', 'SALE'), 40);
    assert.equal(previousCountFrom({ remax: { lince: { SALE: 40 } } }, 'urbania', 'lince', 'SALE'), null);
    assert.equal(previousCountFrom({ remax: { lince: { SALE: 40 } } }, 'remax', 'lince', 'RENT'), null);
  });

  it('old shape is urbania only', () => {
    assert.equal(previousCountFrom({ lince: { SALE: 281 } }, 'urbania', 'lince', 'SALE'), 281);
    assert.equal(previousCountFrom({ lince: { SALE: 281 } }, 'adondevivir', 'lince', 'SALE'), null);
  });

  it('reads nothing from a missing or malformed value', () => {
    assert.equal(previousCountFrom(null, 'urbania', 'lince', 'SALE'), null);
    assert.equal(previousCountFrom('x', 'urbania', 'lince', 'SALE'), null);
    assert.equal(previousCountFrom({ lince: { SALE: 'many' } }, 'urbania', 'lince', 'SALE'), null);
  });
});

describe('gateSkips', () => {
  it('gate skips when a source collapses to zero', () => assert.equal(gateSkips(0, 281, 0.2), true));
  it('gate passes a normal run', () => assert.equal(gateSkips(270, 281, 0.2), false));
  it('gate passes the first run', () => assert.equal(gateSkips(0, null, 0.2), false));
  it('gate passes when the last count was zero', () => assert.equal(gateSkips(0, 0, 0.2), false));
});
