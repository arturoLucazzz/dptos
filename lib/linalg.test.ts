import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dot, mean, median, quantile, solve, solveNormalEquations } from './linalg';

describe('solve', () => {
  it('solves a system with a known answer', () => {
    // x + y = 3, x - y = 1  =>  x = 2, y = 1
    const beta = solve(
      [
        [1, 1],
        [1, -1],
      ],
      [3, 1]
    );
    assert.ok(beta);
    assert.ok(Math.abs(beta[0] - 2) < 1e-12);
    assert.ok(Math.abs(beta[1] - 1) < 1e-12);
  });

  it('needs pivoting and still works', () => {
    // A zero in the first pivot position: fails without a row swap.
    const beta = solve(
      [
        [0, 2],
        [3, 1],
      ],
      [4, 5]
    );
    assert.ok(beta);
    assert.ok(Math.abs(beta[0] - 1) < 1e-12);
    assert.ok(Math.abs(beta[1] - 2) < 1e-12);
  });

  it('returns null for a singular system', () => {
    assert.equal(
      solve(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6]
      ),
      null
    );
  });
});

describe('solveNormalEquations', () => {
  it('recovers the coefficients of an exact linear relation', () => {
    // y = 5 + 3·a - 2·b, sampled without noise.
    const rows = [
      [1, 0, 0],
      [1, 1, 0],
      [1, 0, 1],
      [1, 2, 1],
      [1, 3, 4],
      [1, 5, 2],
    ];
    const y = rows.map(([, a, b]) => 5 + 3 * a - 2 * b);
    const beta = solveNormalEquations(rows, y);
    assert.ok(beta);
    for (const [i, expected] of [5, 3, -2].entries()) {
      assert.ok(Math.abs(beta[i] - expected) < 1e-6, `coefficient ${i} was ${beta[i]}`);
    }
  });

  it('survives a perfectly collinear column instead of crashing', () => {
    // The third column is twice the second: singular without the ridge term.
    const rows = [
      [1, 1, 2],
      [1, 2, 4],
      [1, 3, 6],
      [1, 4, 8],
    ];
    const y = [3, 5, 7, 9];
    const beta = solveNormalEquations(rows, y, 1e-6);
    assert.ok(beta, 'expected a usable answer despite the collinearity');
    for (const row of rows) {
      assert.ok(Math.abs(dot(row, beta) - (1 + 2 * row[1])) < 0.01);
    }
  });

  it('rejects mismatched shapes and empty input', () => {
    assert.equal(solveNormalEquations([], []), null);
    assert.equal(solveNormalEquations([[1, 2]], [1, 2]), null);
    assert.equal(solveNormalEquations([[1], [1, 2]], [1, 2]), null);
  });
});

describe('quantile', () => {
  it('interpolates between neighbours', () => {
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
    assert.equal(quantile([1, 2, 3, 4], 0), 1);
    assert.equal(quantile([1, 2, 3, 4], 1), 4);
  });

  it('does not care about input order and handles single values', () => {
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(quantile([7], 0.9), 7);
    assert.ok(Number.isNaN(quantile([], 0.5)));
  });

  it('clamps out-of-range probabilities', () => {
    assert.equal(quantile([1, 2, 3], -1), 1);
    assert.equal(quantile([1, 2, 3], 2), 3);
  });
});

describe('mean and dot', () => {
  it('computes the obvious things', () => {
    assert.equal(mean([1, 2, 3, 4]), 2.5);
    assert.ok(Number.isNaN(mean([])));
    assert.equal(dot([1, 2, 3], [4, 5, 6]), 32);
  });
});
