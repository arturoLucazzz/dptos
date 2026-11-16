/**
 * Urbania as a source adapter: the existing headed-browser scraper, with its
 * cards mapped to the shared `ListingCard`.
 */

import { Operation } from '@/lib/generated/prisma/enums';
import { fromUrbaniaCard } from '@/lib/listing-card';
import { UrbaniaScraper } from '../scrapers/urbania-scraper';
import type { CrawlError } from '../scrapers/urbania/crawl';
import type { ScraperFilters } from '../types/index';
import type { SourceAdapter, SourceDistrictResult } from './types';

function describeError(error: CrawlError): string {
  const band = `${error.band.min ?? ''}-${error.band.max ?? ''}`;
  return `${error.districtSlug} band ${band} page ${error.page}: ${error.message} (${error.url})`;
}

export function createUrbaniaAdapter(): SourceAdapter {
  return {
    id: 'urbania',
    operations: [Operation.SALE, Operation.RENT],

    async crawl({ districts, operation, onBatch }) {
      // No bedroom filter: the whole district is wanted, and narrowing it also
      // narrows the comparables the fair-price model can use later.
      const filters: ScraperFilters = {
        propertyType: 'apartment',
        operationType: operation === Operation.RENT ? 'rent' : 'sale',
        districts,
        city: 'Lima',
        sort: 'priceAsc',
      };

      const scraper = new UrbaniaScraper({
        engine: (process.env.SCRAPER_ENGINE as 'playwright' | 'puppeteer') || 'playwright',
        onBatch: (batch) =>
          onBatch({
            districtSlug: batch.districtSlug,
            cards: batch.cards.map((card) => fromUrbaniaCard(card, 'urbania', batch.districtSlug)),
          }),
      });

      const result = await scraper.scrape(filters);

      const districtResults: SourceDistrictResult[] = scraper.districtResults.map((district) => ({
        districtSlug: district.districtSlug,
        pagesFetched: district.pagesFetched,
        blocked: district.blocked,
        errors: district.errors.map(describeError),
        claimedTotal: district.claimedTotal,
      }));

      // The base scraper catches a failure that ends the crawl early (a browser
      // that would not start, a crash mid-district). The districts finished before
      // it are still good, so they are returned, and the crawl is flagged
      // incomplete so the loop treats the source as failed. With none finished,
      // the source failed as a whole.
      const fatal = result.metadata?.errors ?? [];
      if (fatal.length > 0) {
        const last = districtResults[districtResults.length - 1];
        if (!last) throw new Error(fatal.join('; '));
        last.errors.push(...fatal.map((message) => `crawl stopped early: ${message}`));
      }

      return { districts: districtResults, skippedOutsideLima: 0, incomplete: fatal.length > 0 };
    },
  };
}
