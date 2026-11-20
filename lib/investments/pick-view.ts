/**
 * What the pick panel shows for one pick. Pure: the server finds the rows, this shapes them.
 * A pick whose listing or project is no longer live stays visible, marked as gone, with its note.
 */

import type { DepartamentosRow } from '../departamentos-query';
import { moneyLine } from '../home';
import { toHomeRow, type HomeRow } from '../home-rows';
import type { ProjectRow } from '../project-rows';

export const GONE_TITLE = 'Ya no está publicado';

export type PickView = {
  itemId: string;
  type: 'unit' | 'project';
  title: string;
  pricePen: number | null;
  districtName: string;
  imageUrl: string | null;
  money: ReturnType<typeof moneyLine>;
  note: string | null;
  gone: boolean;
  url: string | null;
  row: HomeRow | null;
};

export type PickItemInput = { id: string; propertyId: string | null; projectId: string | null; note: string | null };

export function toPickView(
  item: PickItemInput,
  unit: DepartamentosRow | null,
  project: ProjectRow | null,
  fallback: { districtName: string }
): PickView {
  const type = item.propertyId ? 'unit' : 'project';
  const base = { itemId: item.id, type, note: item.note } as const;
  if (type === 'unit' && unit) {
    return {
      ...base,
      title: `${unit.bedrooms ?? '-'} dorm · ${unit.areaM2 ?? '-'} m²`,
      pricePen: unit.pricePen,
      districtName: unit.districtName,
      imageUrl: unit.imageUrl,
      money: moneyLine(unit.monthlyGainPen),
      gone: false,
      url: unit.url,
      row: toHomeRow(unit),
    };
  }
  if (type === 'project' && project) {
    return {
      ...base,
      title: project.name,
      pricePen: project.priceFromPen,
      districtName: project.districtName,
      imageUrl: project.imageUrl,
      money: null,
      gone: false,
      url: project.url,
      row: null,
    };
  }
  return {
    ...base,
    title: GONE_TITLE,
    pricePen: null,
    districtName: fallback.districtName,
    imageUrl: null,
    money: null,
    gone: true,
    url: null,
    row: null,
  };
}
