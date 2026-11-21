/** The portals a listing is published on, one badge each, for the cards and the table. */

import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from './listing-card';

export type SourceBadge = { source: SourceId; label: string; url: string | null };

/** One badge per portal in the SOURCE_IDS order, with the first URL that portal has. */
export function sourceBadges(copies: { source: SourceId | null; url: string | null }[]): SourceBadge[] {
  const bySource = new Map<SourceId, string | null>();
  for (const c of copies) {
    if (c.source == null) continue;
    if (!bySource.has(c.source) || (bySource.get(c.source) == null && c.url != null)) bySource.set(c.source, c.url);
  }
  return SOURCE_IDS.filter((s) => bySource.has(s)).map((s) => ({ source: s, label: SOURCE_LABELS[s], url: bySource.get(s) ?? null }));
}
