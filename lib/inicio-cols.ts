/** Cards per row on Inicio: a small number field, remembered in the browser. */

export const COLS_MIN = 2;
export const COLS_MAX = 6;
export const COLS_DEFAULT = 4;

function toCols(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(COLS_MAX, Math.max(COLS_MIN, Math.round(n)));
}

/** The stored choice, or the default when there is none or it is not a number. */
export function parseCols(stored: string | null): number {
  return toCols(stored) ?? COLS_DEFAULT;
}

/** What the person typed, clamped; a half-typed or empty field keeps the last value. */
export function nextCols(typed: string, last: number): number {
  return toCols(typed) ?? last;
}
