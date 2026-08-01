/**
 * The small amount of linear algebra the fair-price regression needs.
 *
 * Kept separate and dependency-free because it is the one part of the model with a
 * single right answer, so it can be tested against known solutions instead of
 * against judgement calls about the housing market.
 */

/**
 * Solve `(XᵗX + ridge·I) β = Xᵗy` by Gaussian elimination with partial pivoting.
 *
 * Normal equations rather than a QR decomposition because the design matrix here is
 * at most a few dozen columns against tens of thousands of rows, so XᵗX is tiny and
 * the numerical penalty does not matter at this scale.
 *
 * The ridge term is not for regularization in the usual sense; it is there because
 * district dummy columns go exactly collinear the moment a district has no rows
 * left after filtering, which turns a singular matrix into a crash. A tiny ridge
 * makes that case return a sane answer instead.
 *
 * Returns null when the system is singular even with the ridge, which means the
 * caller asked for something the data cannot answer.
 */
export function solveNormalEquations(
  X: readonly number[][],
  y: readonly number[],
  ridge = 1e-8
): number[] | null {
  const n = X.length;
  if (n === 0 || y.length !== n) return null;
  const k = X[0].length;
  if (k === 0) return null;

  // XᵗX, exploiting symmetry.
  const xtx: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty: number[] = new Array(k).fill(0);

  for (let row = 0; row < n; row++) {
    const xr = X[row];
    if (xr.length !== k) return null;
    for (let i = 0; i < k; i++) {
      const xi = xr[i];
      if (!Number.isFinite(xi)) return null;
      xty[i] += xi * y[row];
      for (let j = i; j < k; j++) xtx[i][j] += xi * xr[j];
    }
  }
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < i; j++) xtx[i][j] = xtx[j][i];
    xtx[i][i] += ridge;
  }

  return solve(xtx, xty);
}

/** Gaussian elimination with partial pivoting. Mutates copies, not the inputs. */
export function solve(a: readonly number[][], b: readonly number[]): number[] | null {
  const k = b.length;
  const m = a.map((row) => [...row]);
  const rhs = [...b];

  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let row = col + 1; row < k; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;

    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    }

    const diagonal = m[col][col];
    for (let row = col + 1; row < k; row++) {
      const factor = m[row][col] / diagonal;
      if (factor === 0) continue;
      for (let c = col; c < k; c++) m[row][c] -= factor * m[col][c];
      rhs[row] -= factor * rhs[col];
    }
  }

  const beta = new Array(k).fill(0);
  for (let row = k - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let col = row + 1; col < k; col++) sum -= m[row][col] * beta[col];
    beta[row] = sum / m[row][row];
    if (!Number.isFinite(beta[row])) return null;
  }
  return beta;
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Linear-interpolated quantile, so p25 of four values is not just "the second one". */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}
