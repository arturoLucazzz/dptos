import { promises as fs } from 'fs';
import path from 'path';
import { ScraperResult } from '../types/index.js';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Ensure data directory exists
 */
export async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
  }
}

/**
 * Save scraper result to JSON file
 */
export async function saveResult(result: ScraperResult): Promise<string> {
  await ensureDataDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${result.source}_${timestamp}.json`;
  const filepath = path.join(DATA_DIR, filename);
  
  await fs.writeFile(filepath, JSON.stringify(result, null, 2), 'utf-8');
  
  return filepath;
}

/**
 * Read all JSON result files from data directory
 */
export async function readAllResults(): Promise<ScraperResult[]> {
  await ensureDataDir();
  
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const results: ScraperResult[] = [];
    
    for (const file of jsonFiles) {
      try {
        const filepath = path.join(DATA_DIR, file);
        const content = await fs.readFile(filepath, 'utf-8');
        const result = JSON.parse(content) as ScraperResult;
        results.push(result);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error reading data directory:', error);
    return [];
  }
}

/**
 * Read a specific result file
 */
export async function readResult(filename: string): Promise<ScraperResult | null> {
  await ensureDataDir();
  
  try {
    const filepath = path.join(DATA_DIR, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content) as ScraperResult;
  } catch (error) {
    console.error(`Error reading file ${filename}:`, error);
    return null;
  }
}

/**
 * Get all result files
 */
export async function listResultFiles(): Promise<string[]> {
  await ensureDataDir();
  
  try {
    const files = await fs.readdir(DATA_DIR);
    return files.filter(file => file.endsWith('.json'));
  } catch (error) {
    console.error('Error listing data directory:', error);
    return [];
  }
}
