'use server';

/**
 * Save and delete owner zones. Each change recomputes every apartment's location
 * score, then expires the listings cache so the table shows the new score at once.
 * saveDrawnZone (the workspace map) recomputes too, but revalidates no path: a revalidation
 * inside an action re-renders the current page, and the workspace keeps its own state.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { ZoneKind } from '@/lib/generated/prisma/enums';
import type { Ring } from '@/lib/location/geo';
import { validatePolygon } from '@/lib/location/polygon-input';
import { validateZoneInput } from '@/lib/location/zone-input';
import type { ZoneOutlineInput } from '@/lib/investments/map-features';
import { recomputeLocationScores } from './recompute';

export type ZoneFormState = {
  result: { ok: true; message: string } | { ok: false; errors: Record<string, string> } | null;
  values: Record<string, string>;
};

/** The shared recompute step, then the old pages that show the score. */
async function recompute(): Promise<string | null> {
  try {
    return await recomputeLocationScores();
  } finally {
    revalidatePath('/departamentos');
    revalidatePath('/favoritos');
    revalidatePath('/zonas');
  }
}

export async function saveZone(_prev: ZoneFormState, formData: FormData): Promise<ZoneFormState> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === 'string') values[key] = value;

  const result = validateZoneInput(values);
  if (!result.ok) return { result, values };
  const zone = result.zone;
  const id = values.id?.trim();

  // A drawn zone keeps its shape; /zonas edits only its name, rating, and note.
  if (zone.kind === 'POLYGON') {
    if (!id) return { result: { ok: false, errors: { form: 'Dibuja la zona en el mapa de una inversión.' } }, values };
    await prisma.zone.update({ where: { id }, data: { name: zone.name, rating: zone.rating, notes: zone.notes } });
    const problem = await recompute();
    if (problem) return { result: { ok: false, errors: { form: problem } }, values: {} };
    return { result: { ok: true, message: `Zona "${zone.name}" guardada. Los puntajes ya se recalcularon.` }, values: {} };
  }

  if (zone.kind === 'DISTRICT') {
    const stat = await prisma.districtStat.findUnique({ where: { slug: zone.districtSlug! }, select: { boundary: true } });
    if (!stat?.boundary) {
      return { result: { ok: false, errors: { districtSlug: 'Falta el límite del distrito. Corre pnpm location:places.' } }, values };
    }
  }

  const data = {
    name: zone.name,
    kind: zone.kind === 'DISTRICT' ? ZoneKind.DISTRICT : ZoneKind.CIRCLE,
    districtSlug: zone.districtSlug,
    latitude: zone.lat,
    longitude: zone.lon,
    radiusM: zone.radiusM,
    rating: zone.rating,
    notes: zone.notes,
  };
  if (id) await prisma.zone.update({ where: { id }, data });
  else await prisma.zone.create({ data });

  const problem = await recompute();
  if (problem) return { result: { ok: false, errors: { form: problem } }, values: {} };
  return { result: { ok: true, message: `Zona "${zone.name}" guardada. Los puntajes ya se recalcularon.` }, values: {} };
}

export async function deleteZone(id: string): Promise<void> {
  await prisma.zone.delete({ where: { id } }).catch(() => undefined);
  await recompute();
}

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
