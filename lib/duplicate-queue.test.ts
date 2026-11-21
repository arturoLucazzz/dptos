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
