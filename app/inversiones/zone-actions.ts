'use server';

/**
 * Save a zone drawn on the workspace map, then recompute every apartment's location score.
 * It revalidates no path: a revalidation inside an action re-renders the current page,
 * and the workspace keeps its own state.
 */

import { prisma } from '@/lib/db';
import { ZoneKind } from '@/lib/generated/prisma/enums';
import type { Ring } from '@/lib/location/geo';
import { validatePolygon } from '@/lib/location/polygon-input';
import { validateZoneInput } from '@/lib/location/zone-input';
import type { ZoneOutlineInput } from '@/lib/investments/map-features';
import { recomputeLocationScores } from './recompute';

export type DrawnZoneResult =
  | { ok: true; zone: ZoneOutlineInput; warning: string | null }
  | { ok: false; errors: Record<string, string> };

/** Store a zone drawn on the workspace map and recompute the location scores. */
export async function saveDrawnZone(input: { name: string; rating: number; notes: string; ring: Ring }): Promise<DrawnZoneResult> {
  const checked = validateZoneInput({ kind: 'POLYGON', name: String(input?.name ?? ''), rating: String(input?.rating ?? ''), notes: String(input?.notes ?? '') });
  const shape = validatePolygon(Array.isArray(input?.ring) ? input.ring : []);
  const errors = checked.ok ? {} : { ...checked.errors };
  if (!shape.ok) errors.ring = shape.error;
  if (!checked.ok || !shape.ok) return { ok: false, errors };

  const zone = checked.zone;
  const saved = await prisma.zone.create({
    data: { name: zone.name, kind: ZoneKind.POLYGON, boundary: [shape.ring], rating: zone.rating, notes: zone.notes },
  });
  const warning = await recomputeLocationScores();
  return { ok: true, zone: { id: saved.id, name: saved.name, rating: saved.rating, rings: [shape.ring] }, warning };
}
