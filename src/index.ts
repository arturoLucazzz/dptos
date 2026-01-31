#!/usr/bin/env node

import { ScraperFilters } from './types/index.js';
import { LIMA_DISTRICT_SLUGS } from './config/districts.js';
import { UrbaniaScraper } from './scrapers/urbania-scraper.js';
import { BaseScraper } from './scrapers/base-scraper.js';
import { saveResult } from './utils/file-utils.js';
import { DataProcessor } from './processor.js';

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'scrape':
      await runScrapers();
      break;
    
    case 'process':
      await processResults(args[1]);
      break;
    
    case 'help':
    default:
      showHelp();
      break;
  }
}

/**
 * Run all scrapers
 */
async function runScrapers() {
  console.log('Starting scrapers...\n');

  // Same filters for all districts: venta, departamentos, 1–2 dorm, antiquity ≤ 5 years
  const filters: ScraperFilters = {
    propertyType: 'apartment',
    operationType: 'sale',
    districts: Array.from(LIMA_DISTRICT_SLUGS),
    // for testing:
    // districts: ['lince'],
    city: 'Lima',
    minBedrooms: 1,
    maxBedrooms: 2,
  };

  // Engine: 'playwright' | 'puppeteer' (set SCRAPER_ENGINE=puppeteer to use Puppeteer)
  const engine = (process.env.SCRAPER_ENGINE as 'playwright' | 'puppeteer') || 'playwright';

  const scrapers: BaseScraper[] = [
    new UrbaniaScraper({ engine }),
    // Add more scrapers here as you implement them
  ];

  // Run each scraper
  for (const scraper of scrapers) {
    try {
      console.log(`\n=== Scraping ${scraper.getName()} ===`);
      const result = await scraper.scrape(filters);
      
      console.log(`Found ${result.totalResults} apartments`);
      
      // Save result
      const filepath = await saveResult(result);
      console.log(`Saved to: ${filepath}`);
      
      if (result.metadata?.errors && result.metadata.errors.length > 0) {
        console.warn('Errors:', result.metadata.errors);
      }
      
    } catch (error) {
      console.error(`Error running scraper ${scraper.getName()}:`, error);
    }
  }

  console.log('\nScraping completed!');
}

/**
 * Process scraped results
 */
async function processResults(filename?: string) {
  const processor = new DataProcessor();
  
  if (filename) {
    await processor.processFile(filename);
  } else {
    await processor.processAll();
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Real Estate Scraper

Usage:
  pnpm scrape                          - Run scrapers (Playwright + Chrome by default)
  SCRAPER_ENGINE=puppeteer pnpm scrape  - Use Puppeteer instead
  PLAYWRIGHT_USE_CHROME=0 pnpm scrape   - Use Playwright's Chromium instead of Chrome
  pnpm process [file]                   - Process result files
`);
}

// Run main function
main().catch(console.error);
