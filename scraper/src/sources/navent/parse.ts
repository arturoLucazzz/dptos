/**
 * Parse one page of Navent's `POST /rplis-api/postings` answer.
 *
 * Urbania and Adondevivir run on Navent, and the endpoint answers with the same
 * object the search page embeds as `__PRELOADED_STATE__.listStore`. So the
 * postings go through the same `mapPosting` the HTML path uses, and a card reads
 * the same whichever way it was fetched.
 */

import { fromUrbaniaCard, type ListingCard } from '@/lib/listing-card';
import { mapPosting, type StateListStore } from '../../scrapers/urbania/parse-preloaded-state';

export interface NaventPage {
  cards: ListingCard[];
  totalResults: number | null;
  totalPages: number | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * A body without a `listPostings` array is not a results page (an error object,
 * a challenge rendered as JSON). It parses to no cards and no totals, which the
 * adapter treats as a failed request rather than an empty district.
 */
export function parseNaventPostings(
  json: unknown,
  baseUrl: string,
  source: 'urbania' | 'adondevivir',
  districtSlug: string
): NaventPage {
  if (!isObject(json) || !Array.isArray(json.listPostings)) {
    return { cards: [], totalResults: null, totalPages: null };
  }

  const store = json as StateListStore;
  const developments = store.developmentData ?? {};
  const cards = (store.listPostings ?? []).map((posting) =>
    fromUrbaniaCard(
      mapPosting(posting, posting.postingId ? developments[posting.postingId] : undefined, baseUrl),
      source,
      districtSlug
    )
  );

  return {
    cards,
    totalResults: numberOrNull(store.paging?.total) ?? numberOrNull(store.totalPosting),
    totalPages: numberOrNull(store.paging?.totalPages),
  };
}
