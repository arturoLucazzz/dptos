import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeAnnotations, planCandidateRepoint, type Annotations } from './duplicates';

function notes(over: Partial<Annotations> = {}): Annotations {
  return { favorite: false, discarded: false, discardReason: null, notes: null, ...over };
}

describe('mergeAnnotations', () => {
  it('favorite survives', () => {
    assert.equal(mergeAnnotations(notes(), notes({ favorite: true })).favorite, true);
    assert.equal(mergeAnnotations(notes({ favorite: true }), notes()).favorite, true);
    assert.equal(mergeAnnotations(notes(), notes()).favorite, false);
  });

  it('visible wins over discarded', () => {
    const merged = mergeAnnotations(notes({ discarded: true, discardReason: 'primer piso' }), notes());
    assert.equal(merged.discarded, false);
    // A reason without a discard would outlive the decision it explained.
    assert.equal(merged.discardReason, null);

    const both = mergeAnnotations(
      notes({ discarded: true, discardReason: 'ruido' }),
      notes({ discarded: true, discardReason: 'primer piso' })
    );
    assert.equal(both.discarded, true);
    assert.equal(both.discardReason, 'ruido');
    assert.equal(
      mergeAnnotations(notes({ discarded: true }), notes({ discarded: true, discardReason: 'ruido' })).discardReason,
      'ruido'
    );
  });

  it('notes join without blanks', () => {
    assert.equal(mergeAnnotations(notes({ notes: 'llamar' }), notes({ notes: 'tiene cochera' })).notes, 'llamar\n---\ntiene cochera');
    assert.equal(mergeAnnotations(notes({ notes: '  ' }), notes({ notes: 'tiene cochera' })).notes, 'tiene cochera');
    assert.equal(mergeAnnotations(notes(), notes()).notes, null);
  });
});

describe('planCandidateRepoint', () => {
  it('moves the removed side to the kept property, smaller id first', () => {
    const plan = planCandidateRepoint('k', 'r', [
      { id: 'c1', propertyAId: 'a', propertyBId: 'r', status: 'OPEN' },
      { id: 'c2', propertyAId: 'r', propertyBId: 'z', status: 'REJECTED' },
    ]);
    assert.deepEqual(plan.update, [
      { id: 'c1', propertyAId: 'a', propertyBId: 'k' },
      { id: 'c2', propertyAId: 'k', propertyBId: 'z' },
    ]);
    assert.deepEqual(plan.remove, []);
  });

  it('drops self pairs', () => {
    const plan = planCandidateRepoint('k', 'r', [{ id: 'c1', propertyAId: 'k', propertyBId: 'r', status: 'OPEN' }]);
    assert.deepEqual(plan, { update: [], remove: ['c1'] });
  });

  it('keeps one row per pair, the decided one first', () => {
    const plan = planCandidateRepoint('k', 'r', [
      { id: 'kept-open', propertyAId: 'k', propertyBId: 'x', status: 'OPEN' },
      { id: 'moved-rejected', propertyAId: 'r', propertyBId: 'x', status: 'REJECTED' },
      { id: 'kept-rejected', propertyAId: 'k', propertyBId: 'y', status: 'REJECTED' },
      { id: 'moved-open', propertyAId: 'r', propertyBId: 'y', status: 'OPEN' },
    ]);
    assert.deepEqual(plan.update, [{ id: 'moved-rejected', propertyAId: 'k', propertyBId: 'x' }]);
    assert.deepEqual(plan.remove.sort(), ['kept-open', 'moved-open']);
  });
});
