/**
 * Building `DedupeSide` values: one from an incoming card, one from a stored
 * property. Kept in one place so ingest and the duplicate review compare the
 * same things.
 */

import type { Prisma } from './generated/prisma/client';
import { PostingKind } from './generated/prisma/enums';
import { nameNorm, streetNorm, type DedupeSide } from './dedupe';
import { normalizeAddress } from './fingerprint';
import { SOURCE_IDS, type ListingCard, type SourceId } from './listing-card';

/** Lowercase, no accents, whitespace collapsed. Null when nothing is left. */
export function titleNorm(title: string | null | undefined): string | null {
  if (!title) return null;
  const cleaned = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

/** Unit numbers are compared exactly, so only case and spacing are evened out. */
export function unitNorm(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const cleaned = unit.toLowerCase().replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function numberOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

/** The side of a card that has no property yet. Its id is empty. */
export function dedupeSideFromCard(card: ListingCard, districtSlug: string, pricePen: number | null): DedupeSide {
  return {
    id: '',
    sources: [card.source],
    districtSlug,
    addressNorm: normalizeAddress(card.address),
    streetNorm: streetNorm(card.address),
    buildingNorm: nameNorm(card.buildingName),
    unitNumber: unitNorm(card.unitNumber),
    developerNorm: nameNorm(card.developerName),
    titleNorm: titleNorm(card.title),
    bedrooms: card.bedrooms,
    areaM2: card.areaTotal ?? card.areaCovered,
    latitude: card.latitude,
    longitude: card.longitude,
    pricePen,
  };
}

/** What `dedupeSideFromProperty` needs from a property. Pass it as `select`. */
export const dedupePropertySelect = {
  id: true,
  districtSlug: true,
  addressNorm: true,
  streetNorm: true,
  buildingNorm: true,
  unitNumber: true,
  bedrooms: true,
  latitude: true,
  longitude: true,
  postings: {
    // A project card's "desde" price says nothing about one unit.
    where: { kind: PostingKind.UNIT },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      source: true,
      removedAt: true,
      currentSnapshot: {
        select: {
          title: true,
          pricePen: true,
          areaTotal: true,
          areaCovered: true,
          bedrooms: true,
          latitude: true,
          longitude: true,
          developerName: true,
        },
      },
    },
  },
} satisfies Prisma.PropertySelect;

export type DedupePropertyRow = Prisma.PropertyGetPayload<{ select: typeof dedupePropertySelect }>;

/**
 * The side of a stored property. Keys come from the property; title, price,
 * area, bedrooms, coordinates and developer come from the current snapshot of
 * its most recently seen live posting.
 */
export function dedupeSideFromProperty(property: DedupePropertyRow): DedupeSide {
  const withSnapshot = property.postings.filter((posting) => posting.currentSnapshot != null);
  const anchor = withSnapshot.find((posting) => posting.removedAt == null) ?? withSnapshot[0];
  const snapshot = anchor?.currentSnapshot ?? null;

  const sources = [...new Set(property.postings.map((posting) => posting.source))].filter(
    (source): source is SourceId => (SOURCE_IDS as readonly string[]).includes(source)
  );

  return {
    id: property.id,
    sources,
    districtSlug: property.districtSlug,
    addressNorm: property.addressNorm,
    streetNorm: property.streetNorm ?? streetNorm(property.addressNorm),
    buildingNorm: property.buildingNorm,
    unitNumber: property.unitNumber,
    developerNorm: nameNorm(snapshot?.developerName),
    titleNorm: titleNorm(snapshot?.title),
    bedrooms: snapshot?.bedrooms ?? property.bedrooms,
    areaM2: numberOrNull(snapshot?.areaTotal ?? snapshot?.areaCovered),
    latitude: numberOrNull(snapshot?.latitude ?? property.latitude),
    longitude: numberOrNull(snapshot?.longitude ?? property.longitude),
    pricePen: numberOrNull(snapshot?.pricePen),
  };
}
