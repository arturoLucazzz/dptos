import { ScraperResult, ApartmentData } from './types/index';
import { readAllResults, readResult } from './utils/file-utils';

/**
 * Process scraped apartment data
 */
export class DataProcessor {
  /**
   * Process all result files
   */
  async processAll(): Promise<void> {
    const results = await readAllResults();
    
    if (results.length === 0) {
      console.log('No result files found. Run scrapers first.');
      return;
    }

    console.log(`\nFound ${results.length} result file(s)\n`);
    
    // Aggregate all apartments
    const allApartments: ApartmentData[] = [];
    const sources = new Set<string>();
    
    for (const result of results) {
      sources.add(result.source);
      allApartments.push(...result.apartments);
    }

    console.log(`Total apartments: ${allApartments.length}`);
    console.log(`Sources: ${Array.from(sources).join(', ')}\n`);

    // Generate statistics
    this.generateStatistics(allApartments);
    
    // Find duplicates
    this.findDuplicates(allApartments);
    
    // Price analysis
    this.analyzePrices(allApartments);
  }

  /**
   * Process a specific result file
   */
  async processFile(filename: string): Promise<void> {
    const result = await readResult(filename);
    
    if (!result) {
      console.error(`Could not read file: ${filename}`);
      return;
    }

    console.log(`\nProcessing: ${filename}`);
    console.log(`Source: ${result.source}`);
    console.log(`Total apartments: ${result.apartments.length}`);
    console.log(`Scraped at: ${result.scrapedAt}\n`);

    this.generateStatistics(result.apartments);
    this.analyzePrices(result.apartments);
  }

  /**
   * Generate statistics about apartments
   */
  private generateStatistics(apartments: ApartmentData[]): void {
    console.log('=== Statistics ===');
    
    // Property types
    const propertyTypes = new Map<string, number>();
    apartments.forEach(apt => {
      const type = apt.propertyType || 'Unknown';
      propertyTypes.set(type, (propertyTypes.get(type) || 0) + 1);
    });
    console.log('\nProperty Types:');
    Array.from(propertyTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });

    // Bedrooms distribution
    const bedrooms = new Map<number | null, number>();
    apartments.forEach(apt => {
      const beds = apt.bedrooms ?? null;
      bedrooms.set(beds, (bedrooms.get(beds) || 0) + 1);
    });
    console.log('\nBedrooms Distribution:');
    Array.from(bedrooms.entries())
      .sort((a, b) => {
        if (a[0] === null) return 1;
        if (b[0] === null) return -1;
        return a[0] - b[0];
      })
      .forEach(([beds, count]) => {
        console.log(`  ${beds ?? 'Unknown'}: ${count}`);
      });

    // Area statistics
    const areas = apartments
      .map(apt => apt.area)
      .filter((area): area is number => area !== null && area !== undefined);
    
    if (areas.length > 0) {
      const avgArea = areas.reduce((a, b) => a + b, 0) / areas.length;
      const minArea = Math.min(...areas);
      const maxArea = Math.max(...areas);
      console.log('\nArea Statistics:');
      console.log(`  Average: ${avgArea.toFixed(2)} m²`);
      console.log(`  Min: ${minArea} m²`);
      console.log(`  Max: ${maxArea} m²`);
    }
  }

  /**
   * Find duplicate apartments (by URL or ID)
   */
  private findDuplicates(apartments: ApartmentData[]): void {
    console.log('\n=== Duplicate Detection ===');
    
    const seen = new Map<string, ApartmentData[]>();
    
    apartments.forEach(apt => {
      const key = apt.url || apt.id;
      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(apt);
    });

    const duplicates = Array.from(seen.entries())
      .filter(([_, apts]) => apts.length > 1);

    if (duplicates.length === 0) {
      console.log('No duplicates found.');
    } else {
      console.log(`Found ${duplicates.length} duplicate(s):`);
      duplicates.forEach(([key, apts]) => {
        console.log(`  ${key}: ${apts.length} occurrences`);
        apts.forEach((apt, idx) => {
          console.log(`    ${idx + 1}. ${apt.source} - ${apt.title || 'No title'}`);
        });
      });
    }
  }

  /**
   * Analyze prices
   */
  private analyzePrices(apartments: ApartmentData[]): void {
    console.log('\n=== Price Analysis ===');
    
    const prices = apartments
      .map(apt => apt.price)
      .filter((price): price is number => price !== null && price !== undefined);
    
    if (prices.length === 0) {
      console.log('No price data available.');
      return;
    }

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
    const minPrice = sortedPrices[0];
    const maxPrice = sortedPrices[sortedPrices.length - 1];

    console.log(`Total with prices: ${prices.length}`);
    console.log(`Average: ${avgPrice.toLocaleString()}`);
    console.log(`Median: ${medianPrice.toLocaleString()}`);
    console.log(`Min: ${minPrice.toLocaleString()}`);
    console.log(`Max: ${maxPrice.toLocaleString()}`);

    // Price per m²
    const pricePerM2 = apartments
      .filter(apt => apt.price !== null && apt.area && apt.area > 0)
      .map(apt => (apt.price! / apt.area!))
      .filter((price): price is number => !isNaN(price));

    if (pricePerM2.length > 0) {
      const avgPricePerM2 = pricePerM2.reduce((a, b) => a + b, 0) / pricePerM2.length;
      console.log(`\nAverage price per m²: ${avgPricePerM2.toFixed(2)}`);
    }
  }
}
