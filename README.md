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

2. Install a browser for scraping (used to bypass Cloudflare on Urbania.pe):
   - **Playwright** (default) uses **Chrome** if installed: `pnpm exec playwright install chrome`
   - To use bundled Chromium instead: `PLAYWRIGHT_USE_CHROME=0 pnpm scrape`
   - **Puppeteer**: Chromium is installed automatically with the `puppeteer` package

3. Build the project:
```bash
pnpm build
```

## Usage

### Scraping

Run all scrapers (Playwright with **Chrome** by default):
```bash
pnpm scrape
```

Use **Puppeteer** instead:
```bash
SCRAPER_ENGINE=puppeteer pnpm scrape
```

Use Playwright’s bundled Chromium instead of Chrome:
```bash
PLAYWRIGHT_USE_CHROME=0 pnpm scrape
```

**Getting 403 from Cloudflare?** Playwright uses installed Chrome by default. If you still get 403: try `SCRAPER_ENGINE=puppeteer`, or `CHALLENGE_WAIT_MS=20000`, or `BROWSER_TIMEOUT_MS=60000`.

Urbania is scraped via the search listing page, e.g.:
`https://urbania.pe/buscar/venta-de-departamentos-en-lince--lima--lima?bedroomMin=1&bedroomMax=2&page=2`

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
│   └── index.ts              # Type definitions (filters, apartment data)
├── scrapers/
│   ├── base-scraper.ts       # Base scraper class
│   ├── urbania-scraper.ts    # Urbania.pe scraper (Playwright or Puppeteer)
│   └── urbania/
│       ├── build-search-url.ts   # Build /buscar/... URL from filters
│       └── parse-urbania-html.ts # Parse listing page HTML with Cheerio
├── utils/
│   ├── anti-blocking.ts     # Anti-blocking utilities
│   ├── browser-fetch.ts    # Playwright session for API (optional)
│   ├── browser-loader.ts   # Playwright/Puppeteer HTML loader
│   └── file-utils.ts       # File I/O utilities
├── processor.ts            # Data processing and analysis
└── index.ts                # Main entry point
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

Sites like Urbania.pe are protected by **Cloudflare**. To avoid being blocked:

- **Urbania scraper** uses a real browser (**Playwright** or **Puppeteer**): it loads the origin once so the Cloudflare challenge runs, then loads each search page (e.g. `/buscar/venta-de-departamentos-en-lince--lima--lima?bedroomMin=1&bedroomMax=2&page=2`) and parses the HTML with Cheerio. Set `SCRAPER_ENGINE=puppeteer` to use Puppeteer.

Other anti-blocking measures:

- Random user agent rotation (for scrapers that don’t use the browser)
- Random delays between requests (configurable per scraper)
- Rate limiting
- Realistic HTTP headers
- Respectful request patterns

## License

ISC
