import { readFile, readdir } from "fs/promises";
import path from "path";

export interface ScraperResult {
  source: string;
  scrapedAt: string;
  totalResults: number;
  apartments: Array<{
    id: string;
    title: string | null;
    url: string;
    location: string;
    priceFormatted: string | null;
    limaDistrictName?: string | null;
    developmentStage?: string | null;
    deliveryDate?: string | null;
  }>;
}

const DATA_DIR = path.join(process.cwd(), "data");

export async function getLatestUrbaniaPath(): Promise<string | null> {
  try {
    const files = await readdir(DATA_DIR);
    const urbania = files
      .filter((f) => f.startsWith("urbania_") && f.endsWith(".json"))
      .sort()
      .reverse();
    return urbania[0] ? path.join(DATA_DIR, urbania[0]) : null;
  } catch {
    return null;
  }
}

export async function getUrbaniaData(): Promise<ScraperResult | null> {
  const filePath = await getLatestUrbaniaPath();
  if (!filePath) return null;
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as ScraperResult;
}
