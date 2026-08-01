/**
 * Result ordering. `priceAsc` is what makes price banding stable; `priceDropped`
 * is Urbania's own "Bajaron de precio" list.
 */
export type UrbaniaSort =
  | 'relevance'
  | 'priceAsc'
  | 'priceDesc'
  | 'newest'
  | 'mostViewed'
  | 'priceDropped';

/**
 * Standardized input filters for all scrapers
 */
export interface ScraperFilters {
  // Property type
  propertyType?: 'apartment' | 'house' | 'office' | 'land' | 'all';
  
  // Operation type
  operationType?: 'sale' | 'rent' | 'all';
  
  // Location filters
  location?: string;
  district?: string;
  /** Multiple districts to scrape (e.g. Urbania: one URL per district). Shared list in config/districts. */
  districts?: string[];
  city?: string;
  
  // Price range
  minPrice?: number;
  maxPrice?: number;
  
  // Property features
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  minArea?: number; // in m²
  maxArea?: number; // in m²

  // Result ordering
  sort?: UrbaniaSort;
  
  // Additional filters (website-specific, stored as key-value pairs)
  customFilters?: Record<string, any>;
}

/**
 * Standardized output format for all scrapers
 */
export interface ApartmentData {
  // Unique identifier
  id: string;
  source: string; // Website name
  /** The platform's own numeric posting id. The only stable identifier available. */
  sourcePostingId?: string | null;
  /** Full slug path of the posting, kept for debugging and as a parse cross-check. */
  sourcePath?: string | null;
  /** Leading token of the slug (e.g. "veclapin"), meaning still unconfirmed. */
  slugPrefix?: string | null;
  /** A single unit for sale/rent vs a development selling many units. */
  kind?: 'UNIT' | 'PROJECT';
  
  // Basic info
  title: string | null;
  description?: string | null;
  url: string;
  
  // Location
  location: string;
  address: string | null;
  district?: string | null;
  city?: string | null;
  /** Lima district slug (e.g. "lince", "san-isidro") when scraping Lima. */
  limaDistrictSlug?: string | null;
  /** Lima district display name (e.g. "Lince", "San Isidro"). */
  limaDistrictName?: string | null;
  
  // Pricing
  price: number | null; // Numeric value in soles, converted when the listing is in USD
  priceFormatted: string | null; // Formatted string (e.g., "S/ 750,060")
  expenses?: number | null; // Monthly expenses/maintenance
  expensesFormatted?: string | null;
  currency?: string; // e.g., "PEN", "USD"
  /** Price exactly as published, before any conversion. */
  priceAmount?: number | null;
  /** Currency the published price is in. */
  priceCurrency?: 'PEN' | 'USD' | null;
  /** True when the price is a "desde" lower bound, as project cards always are. */
  priceIsFrom?: boolean;
  
  // Property details
  propertyType: string; // e.g., "Departamento", "Casa"
  operationType: string; // e.g., "Venta", "Alquiler"
  /** Development stage: "Entrega inmediata" | "En construcción" | "En planos" (projects only). */
  developmentStage?: string | null;
  /** Delivery date when stage is "En construcción" or "En planos" (e.g. "diciembre 2026"). */
  deliveryDate?: string | null;
  
  // Features
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null; // in m², total area when both are published
  /** Total area ("64 m² tot."), distinct from usable area. */
  areaTotal?: number | null;
  /** Usable area ("58 m² útil"). */
  areaUseful?: number | null;
  parkingSpots?: number | null;
  /** Monthly maintenance fee published on the card. */
  maintenance?: number | null;
  /** Age in years when published; 0 means "a estrenar". */
  antiquityYears?: number | null;

  // Project-only ranges, since a single value would be invented
  bedroomsMin?: number | null;
  bedroomsMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  /** Number of units the development offers. */
  unitsCount?: number | null;
  
  // Additional features (flexible structure)
  features?: Array<{
    id?: string;
    label: string;
    value: string | number;
    measure?: string | null;
  }>;
  
  // Media
  images?: Array<{
    url: string;
    thumbnail?: string;
    order?: number;
  }>;
  
  // Publisher/Agent info
  publisher?: {
    id?: string;
    name: string | null;
    logo?: string | null;
    url?: string | null;
  } | null;
  
  // Metadata
  scrapedAt: string; // ISO timestamp
  rawData?: any; // Original data from the website (for debugging)
}

/**
 * Scraper result containing all apartments
 */
export interface ScraperResult {
  source: string;
  scrapedAt: string;
  totalResults: number;
  apartments: ApartmentData[];
  filters: ScraperFilters;
  metadata?: {
    pagesScraped?: number;
    errors?: string[];
    warnings?: string[];
  };
}
