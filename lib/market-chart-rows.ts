/** Shapes the market dashboard numbers into chart rows. A missing value stays null: charts say "sin datos", never 0. */

import type { ConstructionPipeline } from './analytics';
import { SOURCE_LABELS } from './listing-card';
import type { DistrictMarket, SourceStats } from './market-dashboard';

/** Districts with fewer sales than this are left out of the rent-vs-price chart. */
export const MIN_SALES_FOR_CHART = 20;

export type RentVsSaleRow = { slug: string; name: string; sale: number | null; rent: number | null; saleCount: number; rentCount: number };

export function rentVsSaleRows(districts: DistrictMarket[]): RentVsSaleRow[] {
  return districts
    .filter((d) => d.saleCount >= MIN_SALES_FOR_CHART)
    .map((d) => ({ slug: d.slug, name: d.name, sale: d.typicalSalePen, rent: d.typicalRentPen, saleCount: d.saleCount, rentCount: d.rentCount }));
}

export type YieldRow = { slug: string; name: string; yieldPct: number | null; top: boolean };

export function yieldRows(districts: DistrictMarket[], topSlugs: string[]): YieldRow[] {
  return districts
    .map((d) => ({ slug: d.slug, name: d.name, yieldPct: d.grossYieldPct, top: topSlugs.includes(d.slug) }))
    .sort((a, b) => (b.yieldPct ?? -Infinity) - (a.yieldPct ?? -Infinity));
}

export type ConstructionRow = { slug: string; name: string; enPlanos: number; enConstruccion: number; entregaInmediata: number };

export function constructionRows(pipeline: ConstructionPipeline[]): ConstructionRow[] {
  return pipeline
    .map((p) => ({ slug: p.districtSlug, name: p.districtName, enPlanos: p.enPlanos, enConstruccion: p.enConstruccion, entregaInmediata: p.entregaInmediata }))
    .filter((r) => r.enPlanos + r.enConstruccion + r.entregaInmediata > 0)
    .sort((a, b) => b.enPlanos + b.enConstruccion + b.entregaInmediata - (a.enPlanos + a.enConstruccion + a.entregaInmediata));
}

export function formatPenOrNoData(n: number | null): string {
  return n == null ? 'sin datos' : `S/ ${Math.round(n).toLocaleString('es-PE')}`;
}

/** The portals the sources table shows, in this order. Manual listings are not a portal. */
export const PORTAL_ORDER = ['urbania', 'adondevivir', 'proper', 'nexo'] as const;

/** One row per portal; a portal with no postings gets zeros and no typical price. */
export function portalRows(sources: SourceStats[]): SourceStats[] {
  return PORTAL_ORDER.map(
    (source) =>
      sources.find((s) => s.source === source) ?? {
        source,
        label: SOURCE_LABELS[source],
        liveCount: 0,
        typicalSalePen: null,
        newLast7: 0,
        goneLast7: 0,
      },
  );
}
