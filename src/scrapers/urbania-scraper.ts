import { BaseScraper } from './base-scraper.js';
import { ScraperFilters, ApartmentData } from '../types/index.js';
import { createBrowserSession } from '../utils/browser-fetch.js';

/**
 * Scraper for Urbania.pe.
 * Uses a real browser session to pass Cloudflare protection.
 */
export class UrbaniaScraper extends BaseScraper {
  private readonly API_BASE = 'https://urbania.pe/rp-api/labs/v1';
  private readonly MAX_NUMBER_OF_RESULTS = 20;

  constructor() {
    super('urbania', 'https://urbania.pe', 1500, 3000);
  }

  protected async fetchApartments(filters: ScraperFilters): Promise<ApartmentData[]> {
    const apartments: ApartmentData[] = [];
    let page = 1;
    let hasMore = true;
    const limit = 20; // API limit per page

    const session = await createBrowserSession(this.baseUrl);
    try {
      while (hasMore) {
        try {
          // Build API URL with filters
          const url = this.buildApiUrl(filters, page, limit);

          console.log(`Fetching page ${page} from ${this.name}...`);

          const data = await session.fetchJson<{
            recommendeds?: unknown[];
            results?: unknown[];
            data?: unknown[];
          }>(url);
        
          // Handle different response structures
          let items: unknown[] = [];
          if (data.recommendeds && Array.isArray(data.recommendeds)) {
            items = data.recommendeds;
          } else if (data.results && Array.isArray(data.results)) {
            items = data.results;
          } else if (Array.isArray(data)) {
            items = data;
          } else if (data.data && Array.isArray(data.data)) {
            items = data.data;
          }

          if (items.length === 0) {
            hasMore = false;
            break;
          }

          // Normalize and add apartments
          for (const item of items) {
            const apartment = this.normalizeApartment(item as Record<string, unknown>, this.baseUrl);
            apartments.push(apartment);
          }

          // Check if we have reached the maximum number of results
          if (apartments.length >= this.MAX_NUMBER_OF_RESULTS) {
            hasMore = false;
            break;
          }

          // Check if there are more pages
          if (items.length < limit) {
            hasMore = false;
          } else {
            page++;
            await this.rateLimiter.wait();
          }
        } catch (error) {
          console.error(`Error fetching page ${page} from ${this.name}:`, error);
          hasMore = false;
        }
      }

      return apartments;
    } finally {
      await session.close();
    }
  }

  /**
   * Build API URL with filters
   */
  private buildApiUrl(filters: ScraperFilters, page: number, limit: number): string {
    const params = new URLSearchParams();
    
    params.append('isMobile', 'false');
    params.append('page', 'listado');
    params.append('limit', String(limit));
    params.append('action', '');
    params.append('isDevelop', 'false');

    // Add filters
    if (filters.location) {
      params.append('location', filters.location);
    }

    if (filters.district) {
      params.append('district', filters.district);
    }

    if (filters.minPrice) {
      params.append('minPrice', String(filters.minPrice));
    }

    if (filters.maxPrice) {
      params.append('maxPrice', String(filters.maxPrice));
    }

    if (filters.minBedrooms) {
      params.append('minBedrooms', String(filters.minBedrooms));
    }

    if (filters.operationType === 'sale') {
      params.append('operationType', 'venta');
    } else if (filters.operationType === 'rent') {
      params.append('operationType', 'alquiler');
    }

    if (filters.propertyType === 'apartment') {
      params.append('propertyType', 'departamento');
    }

    // Add custom filters
    if (filters.customFilters) {
      Object.entries(filters.customFilters).forEach(([key, value]) => {
        params.append(key, String(value));
      });
    }

    // For now, using the recommended endpoint as example
    // In production, you'd use the search endpoint
    return `${this.API_BASE}/recommended?${params.toString()}`;
  }

  /**
   * Override normalize to handle Urbania-specific data structure
   */
  protected normalizeApartment(rawData: any, sourceUrl: string): ApartmentData {
    const base = super.normalizeApartment(rawData, sourceUrl);
    
    // Urbania-specific normalization
    const fullUrl = rawData.url?.startsWith('http') 
      ? rawData.url 
      : `${this.baseUrl}${rawData.url || ''}`;

    return {
      ...base,
      id: rawData.postingId || rawData.id || base.id,
      url: fullUrl,
      currency: 'PEN', // Peruvian Sol
    };
  }
}
