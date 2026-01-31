import { BaseScraper } from './base-scraper.js';
import { ScraperFilters, ApartmentData } from '../types/index.js';
import { LIMA_DISTRICT_NAMES } from '../config/districts.js';
import { createBrowserLoader, type BrowserEngine } from '../utils/browser-loader.js';
import { buildUrbaniaSearchUrl } from './urbania/build-search-url.js';
import {
  parseUrbaniaSearchPage,
  parseFeatures,
  type UrbaniaCardRaw,
} from './urbania/parse-urbania-html.js';

/**
 * Scraper for Urbania.pe using the search listing page.
 * Loads HTML with Playwright or Puppeteer and parses listing cards.
 */
export class UrbaniaScraper extends BaseScraper {
  private readonly engine: BrowserEngine;
  private readonly MAX_NUMBER_OF_RESULTS = 100;
  private readonly MAX_NUMBER_OF_PAGES = 10;
  // for testing:
  // private readonly MAX_NUMBER_OF_RESULTS = 10;
  // private readonly MAX_NUMBER_OF_PAGES = 1;

  constructor(options?: { engine?: BrowserEngine }) {
    super('urbania', 'https://urbania.pe', 1500, 3000);
    this.engine = options?.engine ?? 'playwright';
  }

  protected async fetchApartments(filters: ScraperFilters): Promise<ApartmentData[]> {
    const districts =
      filters.districts && filters.districts.length > 0
        ? filters.districts
        : [filters.district || filters.location || 'lima'];

    const loader = await createBrowserLoader(this.baseUrl, this.engine);
    const seenIds = new Set<string>();
    const apartments: ApartmentData[] = [];

    try {
      for (const district of districts) {
        const districtFilters: ScraperFilters = {
          ...filters,
          district,
          districts: undefined,
        };
        const districtSlug = district.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const url = buildUrbaniaSearchUrl(districtFilters, page);
          console.log(`Fetching ${this.name} (${this.engine}): ${districtSlug} page ${page}`);

          const html = await loader.loadHtml(url);
          const cards = parseUrbaniaSearchPage(html, this.baseUrl);

          if (cards.length === 0) {
            hasMore = false;
            break;
          }

          const limaDistrictName = LIMA_DISTRICT_NAMES[districtSlug] ?? null;
          for (const card of cards) {
            if (seenIds.has(card.id)) continue;
            seenIds.add(card.id);
            apartments.push(this.cardToApartment(card, districtSlug, limaDistrictName));
          }

          if (page >= this.MAX_NUMBER_OF_PAGES) {
            hasMore = false;
          } else {
            page++;
            await this.rateLimiter.wait();
          }
        }

        await this.rateLimiter.wait();
      }

      return apartments;
    } finally {
      await loader.close();
    }
  }

  private cardToApartment(
    card: UrbaniaCardRaw,
    limaDistrictSlug: string,
    limaDistrictName: string | null
  ): ApartmentData {
    const { bedrooms, area } = parseFeatures(card.features);
    const propertyType =
      card.postingType === 'DEVELOPMENT' ? 'Proyecto' : card.postingType === 'PROPERTY' ? 'Departamento' : card.postingType;

    return {
      id: card.id,
      source: this.name,
      title: card.title,
      url: card.url,
      location: card.location ?? '',
      address: card.address,
      limaDistrictSlug,
      limaDistrictName,
      price: card.price,
      priceFormatted: card.priceFormatted,
      currency: 'PEN',
      propertyType,
      operationType: 'Venta',
      developmentStage: card.developmentStage ?? null,
      deliveryDate: card.deliveryDate ?? null,
      bedrooms,
      area,
      images: card.imageUrl ? [{ url: card.imageUrl }] : undefined,
      publisher: card.publisherName ? { name: card.publisherName } : null,
      scrapedAt: new Date().toISOString(),
    };
  }
}
