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

const LEVEL_ORDER: Record<string, number> = { MEDIUM: 0, LOW: 1 };
const levelRank = (level: string) => LEVEL_ORDER[level] ?? 2;

/**
 * The queue the owner reviews. Both rows of a pair carry the same flag, so each pair is shown
 * once: the first row keeps it and later rows lose it. Flags go MEDIUM before LOW inside a row,
 * and rows with a MEDIUM flag go before rows with only LOW flags. Rows left with no flag and
 * fewer than 2 copies are dropped; multi-copy rows with no flag come last (see duplicateQueue).
 */
export function reviewQueue<
  T extends { duplicateFlags: { candidateId: string; level: string }[]; copies: unknown[] },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  const deduped = rows.map((row) => {
    const flags = row.duplicateFlags.filter((f) => {
      if (seen.has(f.candidateId)) return false;
      seen.add(f.candidateId);
      return true;
    });
    return {
      ...row,
      duplicateFlags: [...flags].sort((a, b) => levelRank(a.level) - levelRank(b.level)),
    };
  });
  const queue = duplicateQueue(deduped);
  const best = (r: T) => (r.duplicateFlags.length ? levelRank(r.duplicateFlags[0].level) : 9);
  // Array.prototype.sort is stable, so the input order stays inside each level.
  return queue.sort((a, b) => best(a) - best(b));
}

/** The price range and counts of the copies a card shows now, so a split updates it at once. */
export function copySummary(copies: { source: string | null; pricePen: number }[]): {
  minPen: number;
  maxPen: number;
  sourceCount: number;
  copyCount: number;
} {
  const prices = copies.map((c) => c.pricePen);
  const sources = new Set(copies.map((c, i) => c.source ?? `unknown:${i}`));
  return { minPen: Math.min(...prices), maxPen: Math.max(...prices), sourceCount: sources.size, copyCount: copies.length };
}
