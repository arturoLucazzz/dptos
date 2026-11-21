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

export interface Decisions {
  /** Candidates the owner decided: both rows of the pair lose that flag. */
  candidateIds: ReadonlySet<string>;
  /** Copies that were split off or marked removed: the row loses that copy. */
  postingIds: ReadonlySet<string>;
}

/**
 * The queue as it stands after the decisions made on this page, without asking the server
 * again. A row keeps the flags and copies that were not decided, and leaves only when it has
 * no flag left and fewer than 2 copies.
 */
export function applyDecisions<
  T extends { duplicateFlags: { candidateId: string }[]; copies: { postingId: string }[] },
>(rows: T[], decisions: Decisions): T[] {
  return rows
    .map((row) => ({
      ...row,
      duplicateFlags: row.duplicateFlags.filter((f) => !decisions.candidateIds.has(f.candidateId)),
      copies: row.copies.filter((c) => !decisions.postingIds.has(c.postingId)),
    }))
    .filter((row) => row.duplicateFlags.length > 0 || row.copies.length >= 2);
}
