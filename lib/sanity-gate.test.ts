import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gateSkips, gateVerdict, previousCountFrom, sliceHistory } from './sanity-gate';

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

describe('sliceHistory', () => {
  const runs = [
    { districtCounts: { urbania: { lince: { SALE: 40 } } }, skippedDistricts: ['urbania:lince:SALE'] },
    { districtCounts: { urbania: { surco: { SALE: 90 } } }, skippedDistricts: [] },
    { districtCounts: { urbania: { lince: { SALE: 0 } } }, skippedDistricts: ['urbania:lince:SALE'] },
    { districtCounts: { lince: { SALE: 281 } }, skippedDistricts: [] },
    { districtCounts: { lince: { SALE: 30 } }, skippedDistricts: ['lince:SALE'] },
  ];

  it('keeps only runs that observed the slice, newest first', () => {
    assert.deepEqual(sliceHistory(runs, 'urbania', 'lince', 'SALE'), [
      { observed: 40, gated: true },
      { observed: 0, gated: true },
      { observed: 281, gated: false },
      { observed: 30, gated: true },
    ]);
  });

  it('other sources do not read the old shape', () => {
    assert.deepEqual(sliceHistory(runs, 'proper', 'lince', 'SALE'), []);
  });
});

describe('gateVerdict', () => {
  const base = { observed: 40, previousCount: 281, ratio: 0.2, manualAccept: false };
  const gated40 = { observed: 40, gated: true };

  it('passes a normal count', () => {
    assert.equal(gateVerdict({ ...base, observed: 270, recent: [] }), 'pass');
  });

  it('skips a first collapse', () => {
    assert.equal(gateVerdict({ ...base, recent: [] }), 'skip');
    assert.equal(gateVerdict({ ...base, recent: [gated40] }), 'skip');
  });

  it('accepts the third collapse in a row', () => {
    assert.equal(gateVerdict({ ...base, recent: [gated40, gated40] }), 'auto-accepted');
  });

  it('never accepts zero on its own', () => {
    assert.equal(gateVerdict({ ...base, observed: 0, recent: [gated40, gated40] }), 'skip');
    assert.equal(gateVerdict({ ...base, recent: [gated40, { observed: 0, gated: true }] }), 'skip');
  });

  it('a normal run in between restarts the count', () => {
    assert.equal(gateVerdict({ ...base, recent: [gated40, { observed: 270, gated: false }, gated40] }), 'skip');
  });

  it('the manual override lets a collapse pass, even to zero', () => {
    assert.equal(gateVerdict({ ...base, observed: 0, recent: [], manualAccept: true }), 'manual-accepted');
  });

  it('the manual override does nothing to a count that passes', () => {
    assert.equal(gateVerdict({ ...base, observed: 270, recent: [], manualAccept: true }), 'pass');
  });
});
