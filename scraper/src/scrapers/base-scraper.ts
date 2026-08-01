import { ScraperFilters, ScraperResult, ApartmentData } from '../types/index';
import { RateLimiter, createHeaders } from '../utils/anti-blocking';

/**
 * Base scraper interface that all website-specific scrapers must implement
 */
export abstract class BaseScraper {
  protected name: string;
  protected rateLimiter: RateLimiter;
  protected baseUrl: string;

  constructor(name: string, baseUrl: string, minDelay: number = 1000, maxDelay: number = 3000) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.rateLimiter = new RateLimiter(minDelay, maxDelay);
  }

  /**
   * Get the scraper name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Scrape apartments based on filters
   * This is the main method that should be called
   */
  async scrape(filters: ScraperFilters): Promise<ScraperResult> {
    const startTime = new Date().toISOString();
    const apartments: ApartmentData[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Wait for rate limiting
      await this.rateLimiter.wait();

      // Fetch apartments (implemented by subclasses)
      const fetchedApartments = await this.fetchApartments(filters);
      apartments.push(...fetchedApartments);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      console.error(`Error scraping ${this.name}:`, errorMessage);
    }

    const result: ScraperResult = {
      source: this.name,
      scrapedAt: new Date().toISOString(),
      totalResults: apartments.length,
      apartments,
      filters,
      metadata: {
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };

    return result;
  }

  /**
   * Fetch apartments from the website
   * Must be implemented by each website-specific scraper
   */
  protected abstract fetchApartments(filters: ScraperFilters): Promise<ApartmentData[]>;

  /**
   * Get headers for HTTP requests
   */
  protected getHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    return createHeaders(additionalHeaders);
  }

  /**
   * Normalize apartment data to standard format
   * Can be overridden by subclasses for custom normalization
   */
  protected normalizeApartment(rawData: any, sourceUrl: string): ApartmentData {
    // This is a basic implementation, subclasses should override
    return {
      id: rawData.id || rawData.postingId || String(Math.random()),
      source: this.name,
      title: rawData.title || null,
      url: rawData.url || sourceUrl,
      location: rawData.location || '',
      address: rawData.address || null,
      price: this.parsePrice(rawData.price),
      priceFormatted: rawData.price || null,
      expenses: this.parsePrice(rawData.expenses),
      expensesFormatted: rawData.expenses || null,
      propertyType: rawData.realEstateType || rawData.propertyType || 'Unknown',
      operationType: rawData.operationType || rawData.onlyOperationType || 'Unknown',
      bedrooms: this.extractBedrooms(rawData),
      bathrooms: this.extractBathrooms(rawData),
      area: this.extractArea(rawData),
      features: rawData.features || [],
      images: this.extractImages(rawData),
      publisher: rawData.publisher ? {
        id: rawData.publisher.publisherId,
        name: rawData.publisher.name,
        logo: rawData.publisher.urlLogo,
        url: rawData.publisher.url,
      } : null,
      scrapedAt: new Date().toISOString(),
      rawData,
    };
  }

  /**
   * Parse price string to number
   */
  protected parsePrice(priceStr: string | null | undefined): number | null {
    if (!priceStr) return null;
    
    // Remove currency symbols and commas
    const cleaned = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Extract bedrooms from raw data
   */
  protected extractBedrooms(rawData: any): number | null {
    if (rawData.bedrooms !== undefined) return rawData.bedrooms;
    if (rawData.features) {
      const bedroomFeature = rawData.features.find((f: any) => 
        f.label?.toLowerCase().includes('dorm') || 
        f.featureId === 'CFT2'
      );
      if (bedroomFeature) {
        const value = parseInt(bedroomFeature.value);
        return isNaN(value) ? null : value;
      }
    }
    return null;
  }

  /**
   * Extract bathrooms from raw data
   */
  protected extractBathrooms(rawData: any): number | null {
    if (rawData.bathrooms !== undefined) return rawData.bathrooms;
    if (rawData.features) {
      const bathroomFeature = rawData.features.find((f: any) => 
        f.label?.toLowerCase().includes('baño') || 
        f.featureId === 'CFT3'
      );
      if (bathroomFeature) {
        const value = parseInt(bathroomFeature.value);
        return isNaN(value) ? null : value;
      }
    }
    return null;
  }

  /**
   * Extract area from raw data
   */
  protected extractArea(rawData: any): number | null {
    if (rawData.area !== undefined) return rawData.area;
    if (rawData.features) {
      const areaFeature = rawData.features.find((f: any) => 
        f.label?.toLowerCase().includes('m²') || 
        f.featureId === 'CFT100'
      );
      if (areaFeature) {
        const value = parseFloat(areaFeature.value);
        return isNaN(value) ? null : value;
      }
    }
    return null;
  }

  /**
   * Extract images from raw data
   */
  protected extractImages(rawData: any): Array<{ url: string; thumbnail?: string; order?: number }> {
    const images: Array<{ url: string; thumbnail?: string; order?: number }> = [];
    
    if (rawData.picture) {
      images.push({
        url: rawData.picture.url1200x1200 || rawData.picture.url730x532 || rawData.picture.url || '',
        thumbnail: rawData.picture.url360x266 || rawData.picture.url215x159,
        order: rawData.picture.order,
      });
    }
    
    if (rawData.images && Array.isArray(rawData.images)) {
      rawData.images.forEach((img: any, index: number) => {
        images.push({
          url: img.url || img.url1200x1200 || '',
          thumbnail: img.thumbnail || img.url360x266,
          order: img.order !== undefined ? img.order : index,
        });
      });
    }
    
    return images.filter(img => img.url);
  }
}
