"use client";

import { Button } from "@/components/ui/button";
import { Chip, compact, OptionList, RangeFields, rangeText, type Option } from "@/components/filters/filter-parts";
import type { HomeFilters } from "@/lib/home-filters";
import { SOURCE_LABELS, type SourceId } from "@/lib/listing-card";
import { cn } from "@/lib/utils";

export type FilterPatch = Partial<Omit<HomeFilters, "orden">>;

const LOCATION_STEPS = [5, 6, 7, 8];
const whole = (n: number | null) => (n == null ? null : Math.round(n));

function listText(values: string[] | null, options: Option[]): string | null {
  if (!values || values.length === 0) return null;
  if (values.length === 1) return options.find((o) => o.value === values[0])?.label ?? values[0];
  return String(values.length);
}

/** The Inicio filters, always visible; every change goes to the URL. */
export function HomeFilterRow({
  filters,
  districtOptions,
  sourceOptions,
  active,
  onChange,
  onClear,
}: {
  filters: HomeFilters;
  districtOptions: Option[];
  sourceOptions: SourceId[];
  active: boolean;
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}) {
  const sources: Option[] = sourceOptions.map((s) => ({ value: s, label: SOURCE_LABELS[s] }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip label="Precio" value={rangeText(filters.precio_min, filters.precio_max, (n) => `S/ ${compact(n)}`)}>
        {(close) => (
          <RangeFields
            min={filters.precio_min}
            max={filters.precio_max}
            placeholders={["Mín. S/", "Máx. S/"]}
            onApply={(lo, hi) => onChange({ precio_min: whole(lo), precio_max: whole(hi) })}
            close={close}
          />
        )}
      </Chip>
      <Chip label="Dormitorios" value={rangeText(filters.dorm_min, filters.dorm_max, String)}>
        {(close) => (
          <RangeFields
            min={filters.dorm_min}
            max={filters.dorm_max}
            placeholders={["Mín.", "Máx."]}
            onApply={(lo, hi) => onChange({ dorm_min: whole(lo), dorm_max: whole(hi) })}
            close={close}
          />
        )}
      </Chip>
      <Chip label="Distrito" value={listText(filters.distrito, districtOptions)}>
        {() => (
          <OptionList
            options={districtOptions}
            selected={filters.distrito ?? []}
            onChange={(next) => onChange({ distrito: next.length ? next : null })}
          />
        )}
      </Chip>
      <Chip label="Área" value={rangeText(filters.area_min, filters.area_max, (n) => `${n} m²`)}>
        {(close) => (
          <RangeFields
            min={filters.area_min}
            max={filters.area_max}
            placeholders={["Mín. m²", "Máx. m²"]}
            onApply={(lo, hi) => onChange({ area_min: whole(lo), area_max: whole(hi) })}
            close={close}
          />
        )}
      </Chip>
      <Chip label="Fuente" value={listText(filters.fuente, sources)}>
        {() => (
          <OptionList
            options={sources}
            selected={filters.fuente ?? []}
            searchPlaceholder="Buscar fuente"
            onChange={(next) => onChange({ fuente: next.length ? (next as SourceId[]) : null })}
          />
        )}
      </Chip>
      <Chip label="Ubicación" value={filters.ubicacion_min == null ? null : `desde ${filters.ubicacion_min}`}>
        {(close) => (
          <div className="flex flex-wrap gap-1.5">
            {[null, ...LOCATION_STEPS].map((n) => (
              <button
                key={n ?? "any"}
                type="button"
                aria-pressed={filters.ubicacion_min === n}
                onClick={() => {
                  onChange({ ubicacion_min: n });
                  close();
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  filters.ubicacion_min === n ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent",
                )}
              >
                {n == null ? "Cualquiera" : `${n} o más`}
              </button>
            ))}
          </div>
        )}
      </Chip>
      {active && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
