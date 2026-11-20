'use server';

/**
 * Save and delete owner zones. Each change recomputes every apartment's location
 * score, then expires the listings cache so the table shows the new score at once.
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { invalidateSaleListings } from '@/lib/listings';
import { prisma } from '@/lib/db';
import { ZoneKind } from '@/lib/generated/prisma/enums';
import { refreshLocations } from '@/lib/location/refresh';
import { validateZoneInput } from '@/lib/location/zone-input';

export type ZoneFormState = {
  result: { ok: true; message: string } | { ok: false; errors: Record<string, string> } | null;
  values: Record<string, string>;
};

async function recompute(): Promise<string | null> {
  try {
    await refreshLocations(prisma);
    return null;
  } catch (error) {
    console.error('location refresh after a zone change failed', error);
    return 'La zona se guardó, pero no se pudo recalcular la ubicación. Corre pnpm location:refresh.';
  } finally {
    revalidateTag('sale-listings', { expire: 0 });
    invalidateSaleListings();
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
  const id = values.id?.trim();
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
