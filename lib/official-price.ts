/**
 * One property, many copies: the official price and the list of ads.
 *
 * The official price of a property is the lowest current price among its live
 * postings. Every other copy stays visible as a link, and every price stays in the
 * snapshots; this only decides which row speaks for the property.
 */

import { SOURCE_IDS, type SourceId } from './listing-card';

export interface CopyInput {
  postingId: string;
  propertyId: string | null;
  source: SourceId;
  url: string | null;
  /** Current price, already converted to soles. */
  pricePen: number;
}

export interface ListingCopy {
  source: SourceId;
  url: string | null;
  pricePen: number;
}

function byPriceThenId(a: CopyInput, b: CopyInput): number {
  if (a.pricePen !== b.pricePen) return a.pricePen - b.pricePen;
  return a.postingId < b.postingId ? -1 : a.postingId > b.postingId ? 1 : 0;
}

/**
 * Groups copies by property and keys each group by its official posting id.
 *
 * Official is the lowest price, the smaller posting id on a tie so the choice is
 * stable between requests. A posting without a property is its own group: nothing
 * says it is the same apartment as anything else.
 */
export function collapseCopies(
  rows: CopyInput[]
): Map<string, { copies: ListingCopy[]; priceMaxPen: number }> {
  const groups = new Map<string, CopyInput[]>();
  for (const row of rows) {
    const key = row.propertyId == null ? `posting:${row.postingId}` : `property:${row.propertyId}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const result = new Map<string, { copies: ListingCopy[]; priceMaxPen: number }>();
  for (const group of groups.values()) {
    const sorted = [...group].sort(byPriceThenId);
    result.set(sorted[0].postingId, {
      copies: sorted.map(({ source, url, pricePen }) => ({ source, url, pricePen })),
      priceMaxPen: sorted[sorted.length - 1].pricePen,
    });
  }
  return result;
}

/** The ad's own page: the stored URL first, else Urbania's path on its domain. */
export function postingUrl(
  source: SourceId,
  sourcePath: string | null,
  sourceUrl: string | null
): string | null {
  if (sourceUrl) return sourceUrl;
  if (source === 'urbania' && sourcePath) return `https://urbania.pe${sourcePath}`;
  return null;
}

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}

/**
 * `Posting.source` is a plain string column. Every writer stores a SourceId and the
 * column defaults to 'urbania', so anything else would be a bug upstream; it is
 * read as Urbania rather than dropping the listing.
 */
export function postingSource(source: string): SourceId {
  return isSourceId(source) ? source : 'urbania';
}
