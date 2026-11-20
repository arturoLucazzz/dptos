"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_PANEL, type PanelAssumptions } from "@/lib/assumption-defaults";
import {
  ASSUMPTIONS_COOKIE,
  assumptionsLabel,
  serializeAssumptions,
} from "@/lib/assumptions-cookie";
import { panelWarnings } from "@/lib/panel-warnings";
import { parseNumericInput, sanitizeNumericInput } from "@/lib/numeric-input";
import { ASSUMPTIONS_CHANGED_EVENT } from "@/hooks/use-assumptions-version";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type RangeKey = "tea" | "tcea" | "downPaymentPct" | "termYears";

const RANGES: { key: RangeKey; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: "tea", label: "TEA", unit: "%", min: 4, max: 14, step: 0.1 },
  { key: "tcea", label: "TCEA", unit: "%", min: 4, max: 16, step: 0.1 },
  { key: "downPaymentPct", label: "Cuota inicial", unit: "%", min: 0, max: 50, step: 1 },
  { key: "termYears", label: "Plazo", unit: "años", min: 5, max: 30, step: 1 },
];

function writeCookie(a: PanelAssumptions) {
  document.cookie = `${ASSUMPTIONS_COOKIE}=${encodeURIComponent(serializeAssumptions(a))}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

function Standard({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return <span className="text-xs text-muted-foreground">Estándar: {text}</span>;
}

export function AssumptionsDialog({ initial }: { initial: PanelAssumptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PanelAssumptions>(initial);
  // The number boxes keep their own text so a half-typed value is not rewritten.
  const [cashText, setCashText] = useState(initial.cashAvailablePen == null ? "" : String(initial.cashAvailablePen));
  const [extraText, setExtraText] = useState(initial.extraMonthlyPen > 0 ? String(initial.extraMonthlyPen) : "");
  const dirty = useRef(false);

  // The pill shows what was last saved; the window edits a copy until it saves.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      writeCookie(values);
      dirty.current = false;
      window.dispatchEvent(new Event(ASSUMPTIONS_CHANGED_EVENT));
      router.refresh();
    }, 300);
    return () => clearTimeout(timer);
  }, [values, router]);

  function change(patch: Partial<PanelAssumptions>) {
    dirty.current = true;
    setValues((prev) => ({ ...prev, ...patch }));
  }

  function resetAll() {
    setCashText("");
    setExtraText("");
    change({ ...DEFAULT_PANEL });
  }

  const cashChanged = values.cashAvailablePen !== DEFAULT_PANEL.cashAvailablePen;
  const warnings = panelWarnings(values);
  const extraChanged = values.extraMonthlyPen !== DEFAULT_PANEL.extraMonthlyPen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/60"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{assumptionsLabel(initial)}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tus supuestos</DialogTitle>
          <DialogDescription>
            Todas las ganancias, cuotas y efectivo se calculan con estos números. Cambia uno y toda la app se recalcula.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {RANGES.map(({ key, label, unit, min, max, step }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`sup-${key}`} className="text-sm font-medium">
                  {label}
                </label>
                <span className="flex items-baseline gap-3">
                  <Standard show={values[key] !== DEFAULT_PANEL[key]} text={`${DEFAULT_PANEL[key]} ${unit}`} />
                  <span className="text-sm tabular-nums">
                    {values[key]} {unit}
                  </span>
                </span>
              </div>
              <input
                id={`sup-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={values[key]}
                onChange={(e) => change({ [key]: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="sup-cash" className="text-sm font-medium">
                Efectivo disponible (S/)
              </label>
              <Standard show={cashChanged} text="según la cuota inicial" />
            </div>
            <Input
              id="sup-cash"
              inputMode="numeric"
              placeholder="Vacío: usa la cuota inicial"
              value={cashText}
              onChange={(e) => {
                const text = sanitizeNumericInput(e.target.value, { allowDecimal: false });
                setCashText(text);
                change({ cashAvailablePen: parseNumericInput(text) });
              }}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="sup-extra" className="text-sm font-medium">
                Amortización extra (S/ al mes)
              </label>
              <Standard show={extraChanged} text="0" />
            </div>
            <Input
              id="sup-extra"
              inputMode="numeric"
              placeholder="0"
              value={extraText}
              onChange={(e) => {
                const text = sanitizeNumericInput(e.target.value, { allowDecimal: false });
                setExtraText(text);
                change({ extraMonthlyPen: parseNumericInput(text) ?? 0 });
              }}
            />
          </div>

          {warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-loss" role="status">
              {warnings.map((w) => (
                <li key={w.kind}>{w.message}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={resetAll}>
            Volver al estándar
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
