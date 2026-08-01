/**
 * Currency conversion for the scraper and the app.
 *
 * Only one rate exists on purpose. The original amount and currency are always
 * stored alongside the converted value, so changing this constant and replaying
 * the conversion recomputes the whole history.
 */

export const USD_PEN = 3.5;

export type Currency = 'PEN' | 'USD';

/** Convert an amount to soles. Returns null when there is nothing to convert. */
export function toPen(amount: number | null | undefined, currency: Currency | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  if (currency === 'USD') return Math.round(amount * USD_PEN);
  return Math.round(amount);
}
