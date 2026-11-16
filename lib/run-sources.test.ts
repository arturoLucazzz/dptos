import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runSourceSections } from './run-sources';

describe('runSourceSections', () => {
  it('reads an old flat run as urbania, recorded', () => {
    const sections = runSourceSections({ lince: { SALE: 281, RENT: 40 } }, []);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].id, 'urbania');
    assert.equal(sections[0].recorded, true);
    assert.deepEqual(sections[0].districts, [{ slug: 'lince', sale: 281, rent: 40 }]);
    assert.equal(sections[0].sale, 281);
  });

  it('lists one section per recorded source in the new shape', () => {
    const counts = { urbania: { lince: { SALE: 300 } }, proper: { lince: { SALE: 37 } } };
    const sections = runSourceSections(counts, ['urbania', 'proper']);
    assert.deepEqual(sections.map((s) => [s.id, s.recorded, s.sale]), [['urbania', true, 300], ['proper', true, 37]]);
  });

  it('marks an observed source missing from sources as not recorded', () => {
    const counts = { urbania: { lince: { SALE: 300 } }, nexo: { lince: { SALE: 3 } } };
    const sections = runSourceSections(counts, ['urbania']);
    assert.deepEqual(sections.map((s) => [s.id, s.recorded]), [['urbania', true], ['nexo', false]]);
  });

  it('records nothing for a new-shape run with empty sources', () => {
    const counts = { proper: { lince: { SALE: 3 } } };
    const sections = runSourceSections(counts, []);
    assert.deepEqual(sections.map((s) => [s.id, s.recorded]), [['proper', false]]);
  });

  it('shows no empty urbania section when a new-shape run has no urbania counts', () => {
    const sections = runSourceSections({ proper: { lince: { SALE: 3 } } }, ['proper']);
    assert.deepEqual(sections.map((s) => s.id), ['proper']);
  });

  it('lists nothing for a run without counts', () => {
    assert.deepEqual(runSourceSections(null, []), []);
    assert.deepEqual(runSourceSections({}, []), []);
  });
});
