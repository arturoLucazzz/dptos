/**
 * Single entry point for turning a search page into cards.
 *
 * The embedded state is tried first because it is richer and not tied to CSS
 * class names, and the DOM is used when it is missing. Which one was used is
 * reported, so a silent downgrade to the poorer parser is visible in the run log
 * instead of showing up months later as missing fields.
 */

import { parseUrbaniaStatePage } from './parse-preloaded-state';
import { parseUrbaniaDomPage, parseUrbaniaDomRecommendations } from './parse-urbania-html';
import type { UrbaniaPageParse } from './types';

export function parseUrbaniaSearchPage(html: string, baseUrl: string): UrbaniaPageParse {
  const fromState = parseUrbaniaStatePage(html, baseUrl);
  if (fromState) {
    return {
      ...fromState,
      // The carousel is rendered client-side and is absent from the state, so it
      // has to be read from the DOM to be reported and excluded.
      recommendations: parseUrbaniaDomRecommendations(html, baseUrl),
    };
  }
  return parseUrbaniaDomPage(html, baseUrl);
}

export type { UrbaniaPageParse };
export * from './types';
