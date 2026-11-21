/**
 * What the pick panel shows for one pick. Pure: the server finds the rows, this shapes them.
 * A pick outside the analysis (no longer live, or still live but flagged, an outlier or
 * discarded) stays visible with its last known price, size, photo and link, a label that says
 * why, and its note. It shows no money numbers and never wins in Comparar.
 */

import type { DepartamentosRow } from '../departamentos-query';
import { moneyLine } from '../home';
import { toHomeRow, type HomeRow } from '../home-rows';
import type { ProjectRow } from '../project-rows';

export const GONE_TITLE = 'Ya no está publicado';
export const EXCLUDED_TITLE = 'Fuera del análisis';

/** The last posting the database has for a pick outside the analysis. `live`: that posting is still published. */
export type LastKnown = {
  /** The project's name; null for a unit. */
  name: string | null;
  pricePen: number | null;
  bedrooms: number | null;
  areaM2: number | null;
  imageUrl: string | null;
  url: string | null;
  live: boolean;
};

export type PickView = {
  itemId: string;
  type: 'unit' | 'project';
  title: string;
  pricePen: number | null;
  areaM2: number | null;
  districtName: string;
  imageUrl: string | null;
  money: ReturnType<typeof moneyLine>;
  note: string | null;
  /** Outside the analysis: no money numbers, never the best in Comparar. */
  gone: boolean;
  /** Why a gone pick is gone; null for a live one. */
  statusLabel: string | null;
  url: string | null;
  row: HomeRow | null;
};

export type PickItemInput = { id: string; propertyId: string | null; projectId: string | null; note: string | null };

function unitTitle(bedrooms: number | null, areaM2: number | null): string {
  return `${bedrooms ?? '-'} dorm · ${areaM2 ?? '-'} m²`;
}

export function toPickView(
  item: PickItemInput,
  unit: DepartamentosRow | null,
  project: ProjectRow | null,
  fallback: { districtName: string; lastKnown?: LastKnown | null }
): PickView {
  const type = item.propertyId ? 'unit' : 'project';
  const base = { itemId: item.id, type, note: item.note } as const;
  if (type === 'unit' && unit) {
    return {
      ...base,
      title: unitTitle(unit.bedrooms, unit.areaM2),
      pricePen: unit.pricePen,
      areaM2: unit.areaM2,
      districtName: unit.districtName,
      imageUrl: unit.imageUrl,
      money: moneyLine(unit.monthlyGainPen),
      gone: false,
      statusLabel: null,
      url: unit.url,
      row: toHomeRow(unit),
    };
  }
  if (type === 'project' && project) {
    return {
      ...base,
      title: project.name,
      pricePen: project.priceFromPen,
      areaM2: null,
      districtName: project.districtName,
      imageUrl: project.imageUrl,
      money: null,
      gone: false,
      statusLabel: null,
      url: project.url,
      row: null,
    };
  }
  const last = fallback.lastKnown ?? null;
  const statusLabel = last?.live ? EXCLUDED_TITLE : GONE_TITLE;
  return {
    ...base,
    title: last ? (type === 'project' ? (last.name ?? 'Proyecto sin nombre') : unitTitle(last.bedrooms, last.areaM2)) : GONE_TITLE,
    pricePen: last?.pricePen ?? null,
    areaM2: last?.areaM2 ?? null,
    districtName: fallback.districtName,
    imageUrl: last?.imageUrl ?? null,
    money: null,
    gone: true,
    statusLabel,
    url: last?.url ?? null,
    row: null,
  };
}
