/**
 * Tell "there are no more listings" apart from "we got blocked".
 *
 * Conflating the two is what makes a Cloudflare challenge look like an empty
 * district, which downstream turns into "every apartment in Lince was sold".
 */

import type { UrbaniaPageParse } from './types';

export type PageOutcome =
  | { kind: 'RESULTS'; cardCount: number }
  | { kind: 'END_OF_RESULTS' }
  | { kind: 'BLOCKED'; reason: string };

const BLOCK_STATUS = new Set([401, 403, 405, 429, 503]);

const CHALLENGE_MARKERS = [
  'just a moment',
  'attention required',
  'cf-browser-verification',
  'cf_chl_opt',
  'challenge-platform',
  'enable javascript and cookies to continue',
  'access denied',
  'unusual traffic',
  'recaptcha',
];

export function classifyPage(input: {
  status: number | null;
  html: string;
  parse: UrbaniaPageParse;
}): PageOutcome {
  const { status, html, parse } = input;

  if (status != null && BLOCK_STATUS.has(status)) {
    return { kind: 'BLOCKED', reason: `HTTP ${status}` };
  }

  const head = html.slice(0, 20_000).toLowerCase();
  const marker = CHALLENGE_MARKERS.find((m) => head.includes(m));
  if (marker) {
    return { kind: 'BLOCKED', reason: `challenge marker "${marker}"` };
  }

  if (parse.cards.length > 0) {
    return { kind: 'RESULTS', cardCount: parse.cards.length };
  }

  // The container renders even when a search legitimately matches nothing.
  // Its absence means we never reached the results page.
  if (!parse.hasResultsContainer) {
    return { kind: 'BLOCKED', reason: 'results container missing from HTML' };
  }

  return { kind: 'END_OF_RESULTS' };
}
