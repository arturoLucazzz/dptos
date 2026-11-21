"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { InvestmentFilters } from "@/lib/investments/filters";
import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from "@/lib/listing-card";
import { sanitizeNumericInput } from "@/lib/numeric-input";
import { Chip, compact, OptionList, RangeFields, rangeText, typed, type Option } from "@/components/filters/filter-parts";

type Change = (patch: Partial<InvestmentFilters>) => void;

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
        {() => <OptionList options={districtOptions} selected={filters.districts} onChange={(districts) => onChange({ districts })} />}
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
