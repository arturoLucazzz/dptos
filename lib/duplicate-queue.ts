/**
 * The rows the owner has to look at for duplicates: rows with a duplicate flag first,
 * then rows with two or more copies and no flag. The input order is kept inside each
 * group, and a row with one copy and no flag is left out.
 */
export function duplicateQueue<T extends { duplicateFlags: unknown[]; copies: unknown[] }>(rows: T[]): T[] {
  const flagged = rows.filter((r) => r.duplicateFlags.length > 0);
  const multi = rows.filter((r) => r.duplicateFlags.length === 0 && r.copies.length >= 2);
  return [...flagged, ...multi];
}
