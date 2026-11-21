"use client";

/** Filter chips shared by Inicio and the investment workspace: a chip opens a small panel. */

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseNumericInput, sanitizeNumericInput } from "@/lib/numeric-input";

export type Option = { value: string; label: string };

/** A typed number, or null when empty or negative (the server drops negatives too). */
export function typed(raw: string): number | null {
  const n = parseNumericInput(raw);
  return n == null || n < 0 ? null : n;
}

export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 2 })} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n);

export function rangeText(min: number | null, max: number | null, fmt: (n: number) => string): string | null {
  if (min != null && max != null) return `${fmt(min)} a ${fmt(max)}`;
  if (min != null) return `desde ${fmt(min)}`;
  if (max != null) return `hasta ${fmt(max)}`;
  return null;
}

export function Chip({
  label,
  value,
  disabled,
  children,
}: {
  label: string;
  value: string | null;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? "No aplica a proyectos" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-40",
            value ? "border-primary bg-primary/15 text-primary" : "border-border text-foreground hover:bg-accent"
          )}
        >
          <span>{value ? `${label}: ${value}` : label}</span>
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export function RangeFields({
  min,
  max,
  placeholders,
  onApply,
  close,
}: {
  min: number | null;
  max: number | null;
  placeholders: [string, string];
  onApply: (min: number | null, max: number | null) => void;
  close: () => void;
}) {
  const [lo, setLo] = useState(min == null ? "" : String(min));
  const [hi, setHi] = useState(max == null ? "" : String(max));
  const apply = () => {
    onApply(typed(lo), typed(hi));
    close();
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="flex items-center gap-2">
        <Input inputMode="numeric" aria-label="Mínimo" placeholder={placeholders[0]} value={lo} onChange={(e) => setLo(sanitizeNumericInput(e.target.value))} />
        <span className="text-xs text-muted-foreground">a</span>
        <Input inputMode="numeric" aria-label="Máximo" placeholder={placeholders[1]} value={hi} onChange={(e) => setHi(sanitizeNumericInput(e.target.value))} />
      </div>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => { onApply(null, null); close(); }}>
          Limpiar
        </Button>
        <Button type="submit" size="sm">
          Aplicar
        </Button>
      </div>
    </form>
  );
}

export function OptionList({
  options,
  selected,
  onChange,
  searchPlaceholder = "Buscar distrito",
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const set = new Set(selected);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  return (
    <div className="space-y-2">
      <Input placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
      <ul className="max-h-64 overflow-y-auto">
        {shown.map((o) => {
          const on = set.has(o.value);
          return (
            <li key={o.value}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="size-3" />}
                </span>
                {o.label}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados</li>}
      </ul>
      {selected.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange([])}>
          <X /> Quitar todos
        </Button>
      )}
    </div>
  );
}
