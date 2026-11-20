/**
 * The money assumptions, kept in a cookie so every screen and the API read the same
 * numbers. URL parameters still win where a link carries its own.
 */

import { DEFAULT_PANEL, type PanelAssumptions } from './assumption-defaults';

export const ASSUMPTIONS_COOKIE = 'dptos_supuestos';

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Read the cookie value. Broken JSON or a bad field falls back to the default. */
export function parseAssumptionsCookie(raw: string | undefined): PanelAssumptions {
  if (!raw) return { ...DEFAULT_PANEL };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PANEL };
  }
  if (typeof data !== 'object' || data === null) return { ...DEFAULT_PANEL };
  const d = data as Record<string, unknown>;
  return {
    downPaymentPct: inRange(d.downPaymentPct, 0, 100) ? d.downPaymentPct : DEFAULT_PANEL.downPaymentPct,
    tea: inRange(d.tea, 1, 30) ? d.tea : DEFAULT_PANEL.tea,
    tcea: inRange(d.tcea, 1, 35) ? d.tcea : DEFAULT_PANEL.tcea,
    termYears:
      inRange(d.termYears, 1, 40) && Number.isInteger(d.termYears) ? d.termYears : DEFAULT_PANEL.termYears,
    cashAvailablePen:
      d.cashAvailablePen === null || d.cashAvailablePen === undefined
        ? DEFAULT_PANEL.cashAvailablePen
        : inRange(d.cashAvailablePen, 0, Number.MAX_SAFE_INTEGER)
          ? d.cashAvailablePen
          : DEFAULT_PANEL.cashAvailablePen,
    extraMonthlyPen: inRange(d.extraMonthlyPen, 0, Number.MAX_SAFE_INTEGER)
      ? d.extraMonthlyPen
      : DEFAULT_PANEL.extraMonthlyPen,
  };
}

export function serializeAssumptions(a: PanelAssumptions): string {
  return JSON.stringify(a);
}

/** The pill text. */
export function assumptionsLabel(a: PanelAssumptions): string {
  return `Supuestos: TEA ${a.tea}% · inicial ${a.downPaymentPct}% · ${a.termYears} años`;
}
