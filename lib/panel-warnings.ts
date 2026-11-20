import { DEFAULT_ASSUMPTIONS, financeFrom, fixedFromDefaults, type PanelAssumptions } from './assumption-defaults';
import { assumptionWarnings, type AssumptionWarning } from './finance';

/**
 * Warnings for the assumptions window, live as the sliders move. The bank minimum
 * comes from the fixed assumptions when the caller has them, else from the defaults.
 */
export function panelWarnings(
  panel: PanelAssumptions,
  bankMinDownPaymentPct: number = DEFAULT_ASSUMPTIONS.bankMinDownPaymentPct
): AssumptionWarning[] {
  return assumptionWarnings(
    financeFrom(panel, { ...fixedFromDefaults(), bankMinDownPaymentPct })
  );
}
