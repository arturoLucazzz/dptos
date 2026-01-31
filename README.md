# Real Estate Scraper

A TypeScript-based scraping project for multiple real estate websites. This project provides a standardized framework for scraping apartment listings from different sources while maintaining consistent input/output formats.

## Features

- **Multi-website support**: Easily add new scrapers for different real estate websites
- **Standardized format**: All scrapers output the same JSON structure
- **Anti-blocking measures**: Built-in rate limiting, random delays, and user agent rotation
- **Flexible filtering**: Common filter interface across all scrapers
- **Data processing**: Tools to analyze and process scraped data
- **Type-safe**: Full TypeScript support with type definitions

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Install Playwright browsers (used to bypass Cloudflare on Urbania.pe):
```bash
pnpm exec playwright install chromium
```

3. Build the project:
```bash
pnpm build
```

## Usage

### Scraping

Run all scrapers:
```bash
pnpm scrape
```

Or in development mode:
```bash
pnpm dev scrape
```

### Processing Results

Process all result files:
```bash
pnpm process
```

Process a specific file:
```bash
pnpm process data/urbania_2026-01-27T12-00-00.json
```

## Project Structure

```
src/
├── types/
│   └── index.ts           # Type definitions (filters, apartment data)
├── scrapers/
│   ├── base-scraper.ts    # Base scraper class
│   └── urbania-scraper.ts # Urbania.pe scraper implementation
├── utils/
│   ├── anti-blocking.ts   # Anti-blocking utilities
│   └── file-utils.ts      # File I/O utilities
├── processor.ts           # Data processing and analysis
└── index.ts              # Main entry point
```

## Adding a New Scraper

1. Create a new file in `src/scrapers/` (e.g., `new-site-scraper.ts`)
2. Extend the `BaseScraper` class:
```typescript
import { BaseScraper } from './base-scraper.js';
import { ScraperFilters, ApartmentData } from '../types/index.js';

export class NewSiteScraper extends BaseScraper {
  constructor() {
    super('newsite', 'https://newsite.com', 1000, 3000);
  }

  protected async fetchApartments(filters: ScraperFilters): Promise<ApartmentData[]> {
    // Implement your scraping logic here
    // Use this.getHeaders() for HTTP requests
    // Use this.rateLimiter.wait() between requests
    // Return normalized ApartmentData[]
  }
}
```

3. Register it in `src/index.ts`:
```typescript
const scrapers: BaseScraper[] = [
  new UrbaniaScraper(),
  new NewSiteScraper(),
];
```

## Data Format

All scrapers output data in the same format:

```json
{
  "source": "urbania",
  "scrapedAt": "2026-01-27T12:00:00.000Z",
  "totalResults": 20,
  "apartments": [
    {
      "id": "148173999",
      "source": "urbania",
      "title": "Departamento en Lince",
      "url": "https://urbania.pe/...",
      "location": "Lince, Lima",
      "address": "Jr. Coronel Domingo Casanova",
      "price": 750060,
      "priceFormatted": "S/ 750,060",
      "bedrooms": 3,
      "bathrooms": 0,
      "area": 116,
      ...
    }
  ],
  "filters": { ... }
}
```

## Filters

All scrapers accept the same filter interface:

```typescript
{
  propertyType?: 'apartment' | 'house' | 'office' | 'land' | 'all';
  operationType?: 'sale' | 'rent' | 'all';
  location?: string;
  district?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  minArea?: number;
  maxArea?: number;
  customFilters?: Record<string, any>; // Website-specific filters
}
```

## Anti-Blocking & Cloudflare

Sites like Urbania.pe are protected by **Cloudflare**, which blocks plain HTTP clients (e.g. axios) with a 403 challenge. To avoid being blocked:

- **Urbania scraper** uses **Playwright** to open a real Chromium session: it loads the site once so the Cloudflare challenge runs, then reuses the same browser context (and cookies) for API requests. No headless detection issues and no 403s from the API.

Other anti-blocking measures:

- Random user agent rotation (for scrapers that don’t use the browser)
- Random delays between requests (configurable per scraper)
- Rate limiting
- Realistic HTTP headers
- Respectful request patterns

## License

ISC
