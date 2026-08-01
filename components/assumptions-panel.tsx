"use client";

import { Suspense, type ReactNode } from "react";
import { AssumptionsProvider, useAssumptionsContext } from "@/components/assumptions-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PanelAssumptions } from "@/lib/assumption-defaults";
import { cn } from "@/lib/utils";

interface FieldSpec {
  key: keyof PanelAssumptions;
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: FieldSpec[] = [
  { key: "downPaymentPct", label: "Inicial", suffix: "%", min: 0, max: 100, step: 1 },
  { key: "tea", label: "TEA", suffix: "%", min: 0, max: 30, step: 0.1 },
  { key: "tcea", label: "TCEA", suffix: "%", min: 0, max: 40, step: 0.1 },
  { key: "termYears", label: "Plazo", suffix: "años", min: 5, max: 30, step: 1 },
];

function AssumptionsPanelInner({ className }: { className?: string }) {
  const { panel, setField, reset, warnings, ready } = useAssumptionsContext();

  return (
    <div
      className={cn(
        "sticky top-14 z-40 -mx-4 mb-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className
      )}
    >
      <div className="flex flex-col gap-3 py-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="mr-2 hidden text-sm font-medium text-muted-foreground sm:block">
            Supuestos
          </div>
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {field.label} ({field.suffix})
              </span>
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
    </div>
  );
}

/** Panel + shared state for anything on the page that reads the assumptions. */
export function AssumptionsShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Suspense fallback={null}>
      <AssumptionsProvider>
        <AssumptionsPanelInner className={className} />
        {children}
      </AssumptionsProvider>
    </Suspense>
  );
}
