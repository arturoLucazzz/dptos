/** Display name of a district slug: the curated Spanish name, else a Spanish title case. */

import { LIMA_DISTRICT_NAMES } from '../scraper/src/config/districts';

const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'el']);

export function districtName(slug: string): string {
  const known = LIMA_DISTRICT_NAMES[slug];
  if (known) return known;
  return slug
    .split('-')
    .filter(Boolean)
    .map((part, i) => (i > 0 && LOWERCASE_WORDS.has(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}
