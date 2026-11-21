import assert from 'node:assert/strict';
import test from 'node:test';
import { COLS_DEFAULT, COLS_MAX, COLS_MIN, nextCols, parseCols } from './inicio-cols';

test('the column limits', () => {
  assert.deepEqual([COLS_MIN, COLS_DEFAULT, COLS_MAX], [2, 4, 6]);
});

test('parseCols reads a stored value', () => {
  assert.equal(parseCols(null), 4);
  assert.equal(parseCols('5'), 5);
  assert.equal(parseCols('abc'), 4);
  assert.equal(parseCols('9'), 6);
  assert.equal(parseCols('1'), 2);
});

test('nextCols clamps and rounds what the person types', () => {
  assert.equal(nextCols('9', 4), 6);
  assert.equal(nextCols('0', 4), 2);
  assert.equal(nextCols('3.7', 4), 4);
  assert.equal(nextCols('', 5), 5);
  assert.equal(nextCols('-', 3), 3);
});
