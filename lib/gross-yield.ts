/** Gross yearly rent over price, in percent. Null when the rent or a positive price is missing. */
export function grossYieldPct(grossRentPen: number | null, pricePen: number): number | null {
  if (grossRentPen == null || !(pricePen > 0)) return null;
  return ((grossRentPen * 12) / pricePen) * 100;
}
