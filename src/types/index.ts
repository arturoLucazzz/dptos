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
  
  // Basic info
  title: string | null;
  description?: string | null;
  url: string;
  
  // Location
  location: string;
  address: string | null;
  district?: string | null;
  city?: string | null;
  
  // Pricing
  price: number | null; // Numeric value in local currency
  priceFormatted: string | null; // Formatted string (e.g., "S/ 750,060")
  expenses?: number | null; // Monthly expenses/maintenance
  expensesFormatted?: string | null;
  currency?: string; // e.g., "PEN", "USD"
  
  // Property details
  propertyType: string; // e.g., "Departamento", "Casa"
  operationType: string; // e.g., "Venta", "Alquiler"
  
  // Features
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null; // in m²
  parkingSpots?: number | null;
  
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
