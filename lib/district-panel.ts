/** The facts the Mercado district panel shows, as ready-to-print Spanish text. Pure, so it is tested alone. */

import type { ConstructionPipeline } from './analytics';
import { formatMetricValue, type DistrictProps } from './district-map';
import type { DistrictMarket } from './market-dashboard';
import { STRATA, type Stratum, type StratumRange } from './stats/strata';

export type PanelLine = { label: string; value: string };
export type PanelStratum = { label: string; range: string; pct: number | null };
export type DistrictPanel = {
  title: string;
  zone: string | null;
  lines: PanelLine[];
  market: PanelLine[] | null;
  strata: PanelStratum[];
  sources: string;
};

const NONE = 'sin datos';
const STRATUM_LABELS: Record<Stratum, string> = {
  alto: 'Alto',
  medio_alto: 'Medio alto',
  medio: 'Medio',
  medio_bajo: 'Medio bajo',
  bajo: 'Bajo',
};
const SOURCES =
  'Población y pobreza: INEI. Estratos de ingreso por persona: INEI 2020. Ingreso de zona: Ipsos. Denuncias: SIDPOL. Precios y proyectos: avisos vigentes en dptos.';

const int = (n: number) => Math.round(n).toLocaleString('es-PE');
const soles = (n: number | null) => (n == null ? NONE : `S/ ${int(n)}`);
const pct = (n: number | null) => (n == null ? NONE : `${n.toLocaleString('es-PE', { maximumFractionDigits: 1 })} %`);

function people(n: number | null): string {
  if (n == null) return NONE;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} mil`;
  return int(n);
}

function rangeText(r: StratumRange | undefined): string {
  if (!r) return NONE;
  if (r.maxPen == null) return `S/ ${int(r.minPen)} o más`;
  if (r.minPen <= 0) return `hasta S/ ${int(r.maxPen)}`;
  return `S/ ${int(r.minPen)} - ${int(r.maxPen)}`;
}

/** The pipeline row of a district; a district with no projects gets 0 when the pipeline loaded at all. */
export function constructionFor(slug: string, list: ConstructionPipeline[]): ConstructionPipeline | undefined {
  const row = list.find((c) => c.districtSlug === slug);
  if (row || list.length === 0) return row;
  return { districtSlug: slug, districtName: '', enPlanos: 0, enConstruccion: 0, entregaInmediata: 0, other: 0, total: 0, unitsApprox: 0 };
}

export function districtPanel(
  props: DistrictProps,
  market: DistrictMarket | undefined,
  construction: ConstructionPipeline | undefined,
  ranges: StratumRange[],
): DistrictPanel {
  return {
    title: props.name,
    zone: props.zone,
    lines: [
      { label: 'Población', value: people(props.population) },
      { label: 'Proyectos activos', value: construction ? int(construction.total) : NONE },
      { label: 'Ingreso promedio del hogar (zona)', value: formatMetricValue(props.zone_household_income_pen, 'S/ al mes') },
      { label: 'Pobreza monetaria', value: pct(props.poverty_pct) },
      { label: 'Denuncias por 10 mil habitantes', value: formatMetricValue(props.complaints_per_10k, null) },
    ],
    market: market
      ? [
          { label: 'Avisos en venta', value: int(market.saleCount) },
          { label: 'Precio típico', value: soles(market.typicalSalePen) },
          { label: 'Alquiler típico', value: soles(market.typicalRentPen) },
          { label: 'Rentabilidad bruta', value: pct(market.grossYieldPct) },
        ]
      : null,
    strata: STRATA.map((s) => ({
      label: STRATUM_LABELS[s],
      range: rangeText(ranges.find((r) => r.stratum === s)),
      pct: props[`stratum_${s}_pct`],
    })),
    sources: SOURCES,
  };
}
