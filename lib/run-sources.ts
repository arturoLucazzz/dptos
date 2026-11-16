/**
 * What /runs shows for each source of a run. Pure; the page only loads the run.
 */

import type { SourceId } from './listing-card';
import { SOURCE_IDS } from './listing-card';
import { isSourceId } from './official-price';
import { isPerSourceShape, isRecord, previousCountFrom } from './sanity-gate';

export interface RunSourceSection {
  id: SourceId;
  /** False when the run observed the source but did not record it (gated or incomplete). */
  recorded: boolean;
  sale: number;
  rent: number;
  districts: { slug: string; sale: number; rent: number }[];
}

function districtSlugsOf(counts: unknown, source: SourceId): string[] {
  if (isPerSourceShape(counts)) {
    const byDistrict = counts[source];
    return isRecord(byDistrict) ? Object.keys(byDistrict) : [];
  }
  return source === 'urbania' && isRecord(counts) ? Object.keys(counts) : [];
}

/**
 * Old runs have no `sources` and flat counts, and count as urbania. A run in the
 * per-source shape with empty `sources` recorded nothing: only the sources that
 * have counts are listed, each marked as not recorded. A run with no counts at
 * all has nothing to list.
 */
export function runSourceSections(districtCounts: unknown, runSources: string[]): RunSourceSection[] {
  const isOldRun = !isPerSourceShape(districtCounts) && isRecord(districtCounts) && Object.keys(districtCounts).length > 0;
  const recorded = runSources.filter(isSourceId);
  if (isOldRun && recorded.length === 0) recorded.push('urbania');

  const observed = SOURCE_IDS.filter((id) => !recorded.includes(id) && districtSlugsOf(districtCounts, id).length > 0);

  return [...recorded, ...observed].map((id) => {
    const districts: RunSourceSection['districts'] = [];
    for (const slug of districtSlugsOf(districtCounts, id)) {
      const sale = previousCountFrom(districtCounts, id, slug, 'SALE');
      const rent = previousCountFrom(districtCounts, id, slug, 'RENT');
      if (sale == null && rent == null) continue;
      districts.push({ slug, sale: sale ?? 0, rent: rent ?? 0 });
    }
    districts.sort((a, b) => a.slug.localeCompare(b.slug));
    return {
      id,
      recorded: recorded.includes(id),
      sale: districts.reduce((sum, d) => sum + d.sale, 0),
      rent: districts.reduce((sum, d) => sum + d.rent, 0),
      districts,
    };
  });
}
