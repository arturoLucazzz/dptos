import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateQueue } from './duplicate-queue';

const row = (id: string, flags: number, copies: number) => ({
  id,
  duplicateFlags: Array.from({ length: flags }, () => ({})),
  copies: Array.from({ length: copies }, () => ({})),
});

describe('duplicateQueue', () => {
  it('puts flagged rows first, then multi-copy rows, and keeps the order inside each group', () => {
    const rows = [row('m1', 0, 2), row('f1', 1, 1), row('m2', 0, 3), row('f2', 2, 2)];
    assert.deepEqual(duplicateQueue(rows).map((r) => r.id), ['f1', 'f2', 'm1', 'm2']);
  });

  it('drops rows with one copy and no flag', () => {
    const rows = [row('a', 0, 1), row('b', 0, 0), row('c', 0, 2)];
    assert.deepEqual(duplicateQueue(rows).map((r) => r.id), ['c']);
  });

  it('returns an empty queue for no rows', () => {
    assert.deepEqual(duplicateQueue([]), []);
  });
});

import { applyDecisions } from './duplicate-queue';

const rowOf = (id: string, flagIds: string[], copyIds: string[]) => ({
  id,
  duplicateFlags: flagIds.map((candidateId) => ({ candidateId })),
  copies: copyIds.map((postingId) => ({ postingId })),
});
const none = { candidateIds: new Set<string>(), postingIds: new Set<string>() };

describe('applyDecisions', () => {
  it('changes nothing when nothing was decided', () => {
    const rows = [rowOf('a', ['c1'], ['p1'])];
    assert.deepEqual(applyDecisions(rows, none), rows);
  });

  it('a row with two flags keeps the other one after deciding one', () => {
    const out = applyDecisions([rowOf('a', ['c1', 'c2'], ['p1'])], { ...none, candidateIds: new Set(['c1']) });
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].duplicateFlags, [{ candidateId: 'c2' }]);
  });

  it('the pair partner (same candidate) drops at the same time', () => {
    const rows = [rowOf('a', ['c1'], ['p1']), rowOf('b', ['c1'], ['p2']), rowOf('c', ['c9'], ['p3'])];
    const out = applyDecisions(rows, { ...none, candidateIds: new Set(['c1']) });
    assert.deepEqual(out.map((r) => r.id), ['c']);
  });

  it('a split drops that copy; the row stays while it has 2 copies or a flag', () => {
    const three = rowOf('a', [], ['p1', 'p2', 'p3']);
    const out = applyDecisions([three], { ...none, postingIds: new Set(['p2']) });
    assert.deepEqual(out[0].copies, [{ postingId: 'p1' }, { postingId: 'p3' }]);
    const flagged = rowOf('b', ['c1'], ['p4', 'p5']);
    assert.equal(applyDecisions([flagged], { ...none, postingIds: new Set(['p5']) }).length, 1);
  });

  it('a row with 1 copy left and no flags is removed', () => {
    const out = applyDecisions([rowOf('a', [], ['p1', 'p2'])], { ...none, postingIds: new Set(['p2']) });
    assert.deepEqual(out, []);
  });
});

import { reviewQueue } from './duplicate-queue';

const flag = (candidateId: string, level: 'MEDIUM' | 'LOW', otherPropertyId = 'x') => ({
  candidateId,
  level,
  otherPropertyId,
});
const rev = (id: string, flags: ReturnType<typeof flag>[], copies = 1) => ({
  id,
  duplicateFlags: flags,
  copies: Array.from({ length: copies }, () => ({})),
});

describe('reviewQueue', () => {
  it('shows a pair once: the second row loses the flag the first row keeps', () => {
    const rows = [rev('a', [flag('c1', 'MEDIUM', 'b')]), rev('b', [flag('c1', 'MEDIUM', 'a')])];
    const out = reviewQueue(rows);
    assert.deepEqual(out.map((r) => r.id), ['a']);
    assert.equal(out[0].duplicateFlags.length, 1);
  });

  it('keeps the other flags of the second row, and a multi-copy row with no flag left', () => {
    const rows = [
      rev('a', [flag('c1', 'LOW')]),
      rev('b', [flag('c1', 'LOW'), flag('c2', 'LOW')]),
      rev('d', [flag('c2', 'LOW')], 2),
    ];
    const out = reviewQueue(rows);
    assert.deepEqual(out.map((r) => [r.id, r.duplicateFlags.map((f) => f.candidateId)]), [
      ['a', ['c1']],
      ['b', ['c2']],
      ['d', []],
    ]);
  });

  it('puts MEDIUM before LOW, inside a row and between rows', () => {
    const rows = [rev('a', [flag('c1', 'LOW'), flag('c2', 'MEDIUM')]), rev('b', [flag('c3', 'LOW')]), rev('c', [flag('c4', 'MEDIUM')])];
    const out = reviewQueue(rows);
    assert.deepEqual(out.map((r) => r.id), ['a', 'c', 'b']);
    assert.deepEqual(out[0].duplicateFlags.map((f) => f.level), ['MEDIUM', 'LOW']);
  });
});

import { copySummary } from './duplicate-queue';

describe('copySummary', () => {
  it('takes the price range and the distinct sources from the copies it is given', () => {
    const copies = [
      { source: 'urbania', pricePen: 400000 },
      { source: 'urbania', pricePen: 420000 },
      { source: 'proper', pricePen: 450000 },
    ];
    assert.deepEqual(copySummary(copies), { minPen: 400000, maxPen: 450000, sourceCount: 2, copyCount: 3 });
    // After a split, the range follows the copies that are left.
    assert.deepEqual(copySummary(copies.slice(0, 2)), { minPen: 400000, maxPen: 420000, sourceCount: 1, copyCount: 2 });
  });

  it('counts a copy with no known source as its own source', () => {
    assert.equal(copySummary([{ source: null, pricePen: 1 }, { source: 'urbania', pricePen: 2 }]).sourceCount, 2);
  });
});
