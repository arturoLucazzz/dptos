/**
 * Is a source still parsing? Compare the fields a fresh page fills with the fields
 * its saved fixture fills. A site redesign rarely throws: it quietly stops filling
 * the area or the price, so the share of filled fields is the signal.
 */

import type { ListingCard } from '@/lib/listing-card';

export interface FillRates {
  price: number;
  area: number;
  bedrooms: number;
  address: number;
  coordinates: number;
}

const LABELS: Record<keyof FillRates, string> = {
  price: 'precio',
  area: 'área',
  bedrooms: 'dormitorios',
  address: 'dirección',
  coordinates: 'coordenadas',
};

/** A fall of more than this many points, as a share, fails the source. */
export const MAX_DROP = 0.2;

export function fillRates(cards: ListingCard[]): FillRates {
  const share = (has: (card: ListingCard) => boolean) =>
    cards.length === 0 ? 0 : cards.filter(has).length / cards.length;
  return {
    price: share((c) => c.priceAmount != null),
    area: share((c) => (c.areaTotal ?? c.areaCovered ?? c.areaMin) != null),
    bedrooms: share((c) => (c.bedrooms ?? c.bedroomsMin) != null),
    address: share((c) => Boolean(c.address?.trim())),
    coordinates: share((c) => c.latitude != null && c.longitude != null),
  };
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function checkSource(input: { cards: ListingCard[]; baseline: FillRates }): {
  pass: boolean;
  reasons: string[];
} {
  if (input.cards.length === 0) return { pass: false, reasons: ['0 avisos'] };
  const rates = fillRates(input.cards);
  const reasons: string[] = [];
  for (const key of Object.keys(LABELS) as (keyof FillRates)[]) {
    // A small epsilon keeps 0.9 → 0.7 (exactly 20 points, in floating point) a pass.
    if (rates[key] < input.baseline[key] - MAX_DROP - 1e-9) {
      reasons.push(`${LABELS[key]}: ${pct(rates[key])} vs ${pct(input.baseline[key])}`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}
