import { promises as fs } from 'fs';
import path from 'path';
import { ScraperResult } from '../types/index';

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
 * Append-only sink so a run that dies partway through keeps what it collected.
 *
 * Writing once at the end means a block at minute 100 of a 120 minute run throws
 * away everything, which then also makes every unseen listing look delisted.
 */
export interface IncrementalSink {
  path: string;
  append(records: unknown[]): Promise<void>;
  count(): number;
  /** Close the file. Call it once the source is done, also after an error. */
  close(): Promise<void>;
}

/**
 * One file per source, run and operation: `data/runs/<source>_<runId>_<operation>.ndjson`.
 * `pnpm replay` reads the operation back from the name.
 */
export async function createIncrementalSink(
  source: string,
  runId: string,
  operation: 'sale' | 'rent'
): Promise<IncrementalSink> {
  const dir = path.join(DATA_DIR, 'runs');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${source}_${runId}_${operation}.ndjson`);
  const handle = await fs.open(filePath, 'a');
  let written = 0;

  return {
    path: filePath,
    async append(records: unknown[]): Promise<void> {
      if (records.length === 0) return;
      await handle.write(records.map((r) => JSON.stringify(r)).join('\n') + '\n');
      written += records.length;
    },
    count: () => written,
    close: () => handle.close(),
  };
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
