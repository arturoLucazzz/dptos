"use client";

import { Suspense, type ReactNode } from "react";
import { AssumptionsProvider, useAssumptionsContext } from "@/components/assumptions-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PanelAssumptions } from "@/lib/assumption-defaults";
import { cn } from "@/lib/utils";

interface FieldSpec {
  key: keyof PanelAssumptions;
  label: string;
  suffix: string;
  tip: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: FieldSpec[] = [
  {
    key: "downPaymentPct",
    label: "Inicial",
    suffix: "%",
    tip: "Enganche: porcentaje del precio que pagas al inicio.",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "tea",
    label: "TEA",
    suffix: "%",
    tip: "Tasa efectiva anual del préstamo.",
    min: 0,
    max: 30,
    step: 0.1,
  },
  {
    key: "tcea",
    label: "TCEA",
    suffix: "%",
    tip: "Tasa total con seguros y comisiones (usada para la cuota).",
    min: 0,
    max: 40,
    step: 0.1,
  },
  {
    key: "termYears",
    label: "Plazo",
    suffix: "años",
    tip: "Años del crédito hipotecario.",
    min: 5,
    max: 30,
    step: 1,
  },
];

/** Editable panel fields (Inicial / TEA / TCEA / Plazo). Renders inline next to filters. */
export function AssumptionsFields({ className }: { className?: string }) {
  const { panel, setField, reset, warnings, ready } = useAssumptionsContext();

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="mr-2 hidden text-sm font-medium text-muted-foreground sm:block">
            Supuestos
          </div>
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-xs text-muted-foreground">
                    {field.label} ({field.suffix})
                  </span>
                </TooltipTrigger>
                <TooltipContent>{field.tip}</TooltipContent>
              </Tooltip>
              <Input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={ready ? panel[field.key] : ""}
                disabled={!ready}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setField(field.key, n as PanelAssumptions[typeof field.key]);
                }}
                className="h-9 w-24"
              />
            </label>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={reset} className="mb-0.5">
            Restablecer
          </Button>
        </div>
        {warnings.length > 0 && (
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
            {warnings.map((w) => (
              <li key={w.kind}>{w.message}</li>
            ))}
          </ul>
        )}
      </div>
    </TooltipProvider>
  );
}

/** Shared assumptions state for the page. Fields render inside the filters card. */
export function AssumptionsShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AssumptionsProvider>{children}</AssumptionsProvider>
    </Suspense>
  );
}
