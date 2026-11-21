/** Gross yearly rent over price, in percent. Null when the rent or a positive price is missing. */
export function grossYieldPct(grossRentPen: number | null, pricePen: number): number | null {
  if (grossRentPen == null || !(pricePen > 0)) return null;
  return ((grossRentPen * 12) / pricePen) * 100;
}

/** Price per square metre. Null when the area or a positive price is missing. */
export function pricePerM2(pricePen: number | null, areaM2: number | null): number | null {
  if (pricePen == null || areaM2 == null || !(areaM2 > 0)) return null;
  return pricePen / areaM2;
}
