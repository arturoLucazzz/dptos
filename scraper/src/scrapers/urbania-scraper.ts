import { BaseScraper } from './base-scraper';
import { ScraperFilters, ApartmentData } from '../types/index';
import { LIMA_DISTRICT_NAMES } from '../config/districts';
import { createBrowserLoader, type BrowserEngine } from '../utils/browser-loader';
import { crawlDistrict, type CrawlBatch, type DistrictCrawlResult } from './urbania/crawl';
import type { UrbaniaCardRaw } from './urbania/types';
import { toPen } from '@/lib/money';

export interface UrbaniaScraperOptions {
  engine?: BrowserEngine;
  /**
   * Called after every page, before the run finishes. A run of two hours that
   * only persists at the end loses everything to a single block at minute 100.
   */
  onBatch?: (batch: CrawlBatch) => Promise<void>;
}

/**
 * Scraper for Urbania.pe using the search listing page.
 *
 * The per-district crawl, including price banding and retries, lives in
 * urbania/crawl.ts. This class adapts it to the shared scraper interface.
 */
export class UrbaniaScraper extends BaseScraper {
  private readonly engine: BrowserEngine;
  private readonly onBatch?: (batch: CrawlBatch) => Promise<void>;
  /** Filled in during a run, so the caller can record per-district health. */
  public districtResults: DistrictCrawlResult[] = [];

  constructor(options?: UrbaniaScraperOptions) {
    super('urbania', 'https://urbania.pe', 1500, 3000);
    this.engine = options?.engine ?? 'playwright';
    this.onBatch = options?.onBatch;
  }

  protected async fetchApartments(filters: ScraperFilters): Promise<ApartmentData[]> {
    const districts =
      filters.districts && filters.districts.length > 0
        ? filters.districts
        : [filters.district || filters.location || 'lima'];

    const loader = await createBrowserLoader(this.baseUrl, this.engine);
    const apartments: ApartmentData[] = [];
    this.districtResults = [];

    try {
      for (const district of districts) {
        const districtSlug = district
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        const result = await crawlDistrict({
          loader,
          baseUrl: this.baseUrl,
          filters,
          districtSlug,
          wait: () => this.rateLimiter.wait(),
          log: (message) => console.log(message),
          onBatch: async (batch) => {
            for (const card of batch.cards) {
              apartments.push(this.cardToApartment(card, districtSlug));
            }
            await this.onBatch?.(batch);
          },
        });

        this.districtResults.push(result);
        console.log(
          `${districtSlug}: ${result.cardCount} postings, ${result.pagesFetched} pages, ` +
            `${result.bands.length} band(s), ${result.errors.length} error(s)${result.blocked ? ', BLOCKED' : ''}`
        );
      }

      return apartments;
    } finally {
      await loader.close();
    }
  }

  private cardToApartment(card: UrbaniaCardRaw, searchedDistrictSlug: string): ApartmentData {
    // Urbania's own location tree beats the slug we searched with, because a
    // posting can be attributed to a neighbouring district.
    const districtSlug = card.districtName
      ? card.districtName
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      : searchedDistrictSlug;

    const pricePen = toPen(card.priceAmount, card.priceCurrency);

    return {
      id: card.sourcePostingId ?? card.sourcePath ?? '',
      source: this.name,
      sourcePostingId: card.sourcePostingId,
      sourcePath: card.sourcePath,
      slugPrefix: card.slugPrefix,
      kind: card.kind,
      title: card.title,
      description: card.description,
      url: card.url,
      location: [card.subzoneName, card.districtName, card.cityName].filter(Boolean).join(', '),
      address: card.address,
      district: card.districtName,
      city: card.cityName,
      limaDistrictSlug: districtSlug,
      limaDistrictName: LIMA_DISTRICT_NAMES[districtSlug] ?? card.districtName ?? null,
      price: pricePen,
      priceFormatted: card.priceFormatted,
      priceAmount: card.priceAmount,
      priceCurrency: card.priceCurrency,
      priceIsFrom: card.priceIsFrom,
      currency: card.priceCurrency ?? 'PEN',
      expenses: card.maintenanceAmount,
      maintenance: card.maintenanceAmount,
      propertyType: card.kind === 'PROJECT' ? 'Proyecto' : card.realEstateType ?? 'Departamento',
      operationType: card.operation === 'RENT' ? 'Alquiler' : 'Venta',
      developmentStage: card.developmentStage,
      deliveryDate: card.deliveryDate,
      bedrooms: card.bedrooms,
      bathrooms: card.bathrooms,
      area: card.areaTotal ?? card.areaCovered,
      areaTotal: card.areaTotal,
      areaUseful: card.areaCovered,
      parkingSpots: card.parkingSpots,
      antiquityYears: card.antiquityYears,
      bedroomsMin: card.bedroomsMin,
      bedroomsMax: card.bedroomsMax,
      areaMin: card.areaMin,
      areaMax: card.areaMax,
      unitsCount: card.unitsCount,
      images: card.imageUrl ? [{ url: card.imageUrl }] : undefined,
      publisher: card.publisherName
        ? { id: card.publisherId ?? undefined, name: card.publisherName }
        : null,
      scrapedAt: new Date().toISOString(),
      rawData: card,
    };
  }
}
