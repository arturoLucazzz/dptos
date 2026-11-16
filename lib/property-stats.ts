/**
 * Statistics that count each apartment once.
 *
 * One apartment listed on several sources is one Property with several postings.
 * A statistic over postings counts it twice, and a copy one source dropped while
 * another still lists it is not a sold apartment. These pure helpers group by
 * property first; the loaders only fetch rows. A posting without a property is its
 * own apartment, as in `collapseCopies`.
 */

import { weekKey } from './dates';
import { collapseCopies } from './official-price';

export function propertyKey(row: { postingId: string; propertyId: string | null }): string {
  return row.propertyId == null ? `posting:${row.postingId}` : `property:${row.propertyId}`;
}

export interface DistrictPosting {
  postingId: string;
  propertyId: string | null;
  districtSlug: string;
}

/** Distinct properties per district, counted from their live postings. */
export function countProperties(rows: DistrictPosting[]): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = propertyKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(row.districtSlug, (counts.get(row.districtSlug) ?? 0) + 1);
  }
  return counts;
}

/**
 * Properties gone per district: every copy is not live.
 *
 * `goneRows` are the not-live postings; `liveElsewhere` holds the ids of properties
 * that still have a live posting on some source, which are not gone.
 */
export function countGoneProperties(
  goneRows: DistrictPosting[],
  liveElsewhere: ReadonlySet<string>
): Map<string, number> {
  return countProperties(
    goneRows.filter((row) => row.propertyId == null || !liveElsewhere.has(row.propertyId))
  );
}

export interface PriceIndexRow {
  postingId: string;
  propertyId: string | null;
  live: boolean;
  lastSeenAt: Date;
  /** Weeks this posting has been observed on the market (live copies only). */
  liveWeeks: string[];
  pricePen: number;
  /** Null when the copy cannot be compared (flagged, no area, no price). */
  perM2: number | null;
}

export interface PriceIndexSamples {
  live: Map<string, number[]>;
  exited: Map<string, number[]>;
}

/**
 * Weekly price/m² samples, one per property.
 *
 * A property is live while any copy is live, at its lowest live price. It exits
 * only when its last live copy goes, in the week that copy was last seen, at its
 * lowest price. Unusable copies still decide liveness but never speak for the price.
 */
export function priceIndexSamples(rows: PriceIndexRow[]): PriceIndexSamples {
  const liveKeys = new Set(rows.filter((r) => r.live).map(propertyKey));
  const liveRows = rows.filter((r) => r.live);
  const deadRows = rows.filter((r) => !r.live && !liveKeys.has(propertyKey(r)));

  const byId = new Map(rows.map((r) => [r.postingId, r]));
  const official = (group: PriceIndexRow[]): PriceIndexRow[] => {
    const usable = group.filter((r) => r.perM2 != null);
    const picked = collapseCopies(
      usable.map((r) => ({
        postingId: r.postingId,
        propertyId: r.propertyId,
        source: null,
        url: null,
        pricePen: r.pricePen,
      }))
    );
    return [...picked.keys()].map((id) => byId.get(id)!);
  };

  const live = new Map<string, number[]>();
  const weeksByProperty = new Map<string, Set<string>>();
  for (const row of liveRows) {
    const weeks = weeksByProperty.get(propertyKey(row)) ?? new Set<string>();
    for (const w of row.liveWeeks) weeks.add(w);
    weeksByProperty.set(propertyKey(row), weeks);
  }
  for (const row of official(liveRows)) {
    for (const week of weeksByProperty.get(propertyKey(row)) ?? []) {
      const list = live.get(week) ?? [];
      list.push(row.perM2!);
      live.set(week, list);
    }
  }

  const exited = new Map<string, number[]>();
  const lastSeen = new Map<string, number>();
  for (const row of deadRows) {
    const key = propertyKey(row);
    lastSeen.set(key, Math.max(lastSeen.get(key) ?? 0, row.lastSeenAt.getTime()));
  }
  for (const row of official(deadRows)) {
    const week = weekKey(new Date(lastSeen.get(propertyKey(row))!));
    const list = exited.get(week) ?? [];
    list.push(row.perM2!);
    exited.set(week, list);
  }
  return { live, exited };
}

/**
 * Price/m² values of live sale properties, one per property at its lowest price.
 * Rows must already be usable comparables.
 */
export function perPropertyPerM2(
  rows: { postingId: string; propertyId: string | null; pricePen: number; perM2: number }[]
): number[] {
  const picked = collapseCopies(
    rows.map((r) => ({
      postingId: r.postingId,
      propertyId: r.propertyId,
      source: null,
      url: null,
      pricePen: r.pricePen,
    }))
  );
  return rows.filter((r) => picked.has(r.postingId)).map((r) => r.perM2);
}

export interface ProjectPostingRow {
  postingId: string;
  projectId: string | null;
  districtSlug: string;
  developmentStage: string | null;
  unitsCount: number | null;
}

export interface ProjectRow {
  districtSlug: string;
  developmentStage: string | null;
  unitsCount: number | null;
}

/**
 * One row per project. Postings of one Project on several sources merge: the
 * smallest posting id speaks for district and stage (stable between requests), and
 * the units are the largest count any source published. A project posting without a
 * project is its own project.
 */
export function collapseProjects(rows: ProjectPostingRow[]): ProjectRow[] {
  const groups = new Map<string, ProjectPostingRow[]>();
  for (const row of rows) {
    const key = row.projectId == null ? `posting:${row.postingId}` : `project:${row.projectId}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => (a.postingId < b.postingId ? -1 : a.postingId > b.postingId ? 1 : 0));
    const units = sorted.reduce((max, r) => Math.max(max, r.unitsCount ?? 0), 0);
    return {
      districtSlug: sorted[0].districtSlug,
      developmentStage: sorted.find((r) => r.developmentStage)?.developmentStage ?? null,
      unitsCount: units > 0 ? units : null,
    };
  });
}
