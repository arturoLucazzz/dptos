"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { InvestmentFilters } from "@/lib/investments/filters";
import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from "@/lib/listing-card";
import { parseNumericInput, sanitizeNumericInput } from "@/lib/numeric-input";

type Option = { value: string; label: string };
type Change = (patch: Partial<InvestmentFilters>) => void;

/** A typed number, or null when empty or negative (the server drops negatives too). */
function typed(raw: string): number | null {
  const n = parseNumericInput(raw);
  return n == null || n < 0 ? null : n;
}

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 2 })} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n);

function rangeText(min: number | null, max: number | null, fmt: (n: number) => string): string | null {
  if (min != null && max != null) return `${fmt(min)} a ${fmt(max)}`;
  if (min != null) return `desde ${fmt(min)}`;
  if (max != null) return `hasta ${fmt(max)}`;
  return null;
}

function Chip({
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

function RangeFields({
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

function DistrictList({ options, selected, onChange }: { options: Option[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [query, setQuery] = useState("");
  const set = new Set(selected);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  return (
    <div className="space-y-2">
      <Input placeholder="Buscar distrito" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
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

function MoreFields({
  sources,
  locationMin,
  onApply,
  close,
}: {
  sources: SourceId[];
  locationMin: number | null;
  onApply: (sources: SourceId[], locationMin: number | null) => void;
  close: () => void;
}) {
  const [picked, setPicked] = useState<SourceId[]>(sources);
  const [loc, setLoc] = useState(locationMin == null ? "" : String(locationMin));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = typed(loc);
        onApply(picked, n == null ? null : Math.min(10, n));
        close();
      }}
    >
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Fuentes</p>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_IDS.map((s) => {
            const on = picked.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(on ? picked.filter((x) => x !== s) : [...picked, s])}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  on ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent"
                )}
              >
                {SOURCE_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Ubicación mínima (0 a 10)</span>
        <Input inputMode="decimal" placeholder="Ej. 6" value={loc} onChange={(e) => setLoc(sanitizeNumericInput(e.target.value))} />
      </label>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => { onApply([], null); close(); }}>
          Limpiar
        </Button>
        <Button type="submit" size="sm">
          Aplicar
        </Button>
      </div>
    </form>
  );
}

export function FilterChips({
  filters,
  districtOptions,
  onChange,
}: {
  filters: InvestmentFilters;
  districtOptions: Option[];
  onChange: Change;
}) {
  const projects = filters.kind === "projects";
  const districtLabel =
    filters.districts.length === 0
      ? null
      : filters.districts.length === 1
        ? (districtOptions.find((o) => o.value === filters.districts[0])?.label ?? filters.districts[0])
        : `${filters.districts.length}`;
  const moreCount = filters.sources.length + (filters.locationMin != null ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Tipo" className="inline-flex h-8 rounded-full border border-border p-0.5">
        {(
          [
            ["units", "Departamentos"],
            ["projects", "Proyectos"],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filters.kind === kind}
            onClick={() => filters.kind !== kind && onChange({ kind })}
            className={cn(
              "rounded-full px-3 text-xs font-medium",
              filters.kind === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Chip label="Distritos" value={districtLabel}>
        {() => <DistrictList options={districtOptions} selected={filters.districts} onChange={(districts) => onChange({ districts })} />}
      </Chip>

      <Chip label="Precio" value={rangeText(filters.priceMin, filters.priceMax, (n) => `S/ ${compact(n)}`)}>
        {(close) => (
          <RangeFields
            min={filters.priceMin}
            max={filters.priceMax}
            placeholders={["Mín. S/", "Máx. S/"]}
            onApply={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
            close={close}
          />
        )}
      </Chip>

      <Chip label="Dormitorios" value={projects ? null : rangeText(filters.bedroomsMin, filters.bedroomsMax, String)} disabled={projects}>
        {(close) => (
          <RangeFields
            min={filters.bedroomsMin}
            max={filters.bedroomsMax}
            placeholders={["Mín.", "Máx."]}
            onApply={(lo, hi) => onChange({ bedroomsMin: lo == null ? null : Math.round(lo), bedroomsMax: hi == null ? null : Math.round(hi) })}
            close={close}
          />
        )}
      </Chip>

      <Chip label="Más" value={projects || moreCount === 0 ? null : String(moreCount)} disabled={projects}>
        {(close) => (
          <MoreFields
            sources={filters.sources}
            locationMin={filters.locationMin}
            onApply={(sources, locationMin) => onChange({ sources, locationMin })}
            close={close}
          />
        )}
      </Chip>
    </div>
  );
}
