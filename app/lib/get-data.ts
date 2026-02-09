import { readFile, readdir } from "fs/promises";
import path from "path";
import type { ScraperResult } from "./types";

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
  const data = JSON.parse(raw) as ScraperResult;

  const filtered = data.apartments
    .filter((a) => {
      if (!a.price || a.price < 100000) return false;
      return true;
    })
    .map((a) => {
      const copy = { ...a };
      if (!copy.developmentStage) {
        copy.developmentStage = "Entrega inmediata";
      }
      return copy;
    });

  return {
    ...data,
    totalResults: filtered.length,
    apartments: filtered,
  };
}
