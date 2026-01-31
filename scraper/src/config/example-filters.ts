import { ScraperFilters } from '../types/index.js';

/**
 * Example filter configurations
 * Use these as templates for your scraping needs
 */

// Example 1: Basic apartment search in Lima
export const basicLimaFilters: ScraperFilters = {
  propertyType: 'apartment',
  operationType: 'sale',
  city: 'Lima',
};

// Example 2: Price range filter
export const priceRangeFilters: ScraperFilters = {
  propertyType: 'apartment',
  operationType: 'sale',
  minPrice: 300000,
  maxPrice: 800000,
  city: 'Lima',
};

// Example 3: Specific district with bedrooms
export const districtBedroomFilters: ScraperFilters = {
  propertyType: 'apartment',
  operationType: 'sale',
  district: 'Miraflores',
  minBedrooms: 2,
  maxBedrooms: 3,
  minArea: 60,
};

// Example 4: Rent apartments
export const rentFilters: ScraperFilters = {
  propertyType: 'apartment',
  operationType: 'rent',
  city: 'Lima',
  minBedrooms: 1,
};

// Example 5: Custom filters for Urbania-specific parameters
export const urbaniaCustomFilters: ScraperFilters = {
  propertyType: 'apartment',
  operationType: 'sale',
  customFilters: {
    // Urbania-specific filters can go here
    // These will be passed directly to the API
  },
};
