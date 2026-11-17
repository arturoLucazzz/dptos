"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PanelAssumptions } from "@/lib/assumption-defaults";
import type { AssumptionWarning } from "@/lib/finance";
import { sanitizeNumericInput } from "@/lib/numeric-input";
import { cn } from "@/lib/utils";

interface FieldSpec {
  key: keyof PanelAssumptions;
  label: string;
  suffix: string;
  tip: string;
  allowDecimal: boolean;
}

const FIELDS: FieldSpec[] = [
  {
    key: "downPaymentPct",
    label: "Inicial",
    suffix: "%",
    tip: "Enganche: porcentaje del precio que pagas al inicio.",
    allowDecimal: false,
  },
  {
    key: "tea",
    label: "TEA",
    suffix: "%",
    tip: "Tasa efectiva anual del préstamo.",
    allowDecimal: true,
  },
  {
    key: "tcea",
    label: "TCEA",
    suffix: "%",
    tip: "Tasa total con seguros y comisiones (usada para la cuota).",
    allowDecimal: true,
  },
  {
    key: "termYears",
    label: "Plazo",
    suffix: "años",
    tip: "Años del crédito hipotecario.",
    allowDecimal: false,
  },
  {
    key: "cashAvailablePen",
    label: "Efectivo disponible",
    suffix: "S/",
    tip: "Lo que tienes hoy. Primero paga los gastos de compra y el resto es la inicial. Déjalo vacío para usar la Inicial en %.",
    allowDecimal: false,
  },
  {
    key: "extraMonthlyPen",
    label: "Amortización extra",
    suffix: "S/ por mes",
    tip: "Lo que pagarías cada mes además de la cuota, para terminar antes el crédito.",
    allowDecimal: false,
  },
];

/** String draft of the four Hipoteca fields (avoids type=number leading-zero quirks). */
export type PanelDraftStrings = Record<keyof PanelAssumptions, string>;

interface AssumptionsFieldsProps {
  panel: PanelDraftStrings;
  setField: <K extends keyof PanelAssumptions>(key: K, value: string) => void;
  reset: () => void;
  warnings?: AssumptionWarning[];
  className?: string;
  /** Larger, centered controls for the Hipoteca card. */
  prominent?: boolean;
}

/** Editable panel fields (Inicial / TEA / TCEA / Plazo). */
export function AssumptionsFields({
  panel,
  setField,
  reset,
  warnings = [],
  className,
  prominent = false,
}: AssumptionsFieldsProps) {
  return (
    <TooltipProvider>
      <div className={cn("flex flex-col gap-3", className)}>
        <div
          className={cn(
            "flex flex-wrap items-end gap-4",
            prominent && "justify-center gap-6"
          )}
        >
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "cursor-pointer text-muted-foreground",
                      prominent ? "text-sm font-medium" : "text-xs"
                    )}
                  >
                    {field.label} ({field.suffix})
                  </span>
                </TooltipTrigger>
                <TooltipContent>{field.tip}</TooltipContent>
              </Tooltip>
              <Input
                type="text"
                inputMode={field.allowDecimal ? "decimal" : "numeric"}
                value={panel[field.key]}
                onChange={(e) => {
                  setField(
                    field.key,
                    sanitizeNumericInput(e.target.value, {
                      allowDecimal: field.allowDecimal,
                    })
                  );
                }}
                className={cn(
                  prominent ? "h-11 w-28 text-center text-base" : "h-9 w-24"
                )}
              />
            </label>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={reset} className="mb-0.5">
            Restablecer
          </Button>
        </div>
        {warnings.length > 0 && (
          <ul className="space-y-1 text-center text-xs text-amber-700 dark:text-amber-400">
            {warnings.map((w) => (
              <li key={w.kind}>{w.message}</li>
            ))}
          </ul>
        )}
      </div>
    </TooltipProvider>
  );
}
