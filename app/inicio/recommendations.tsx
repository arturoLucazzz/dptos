"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryStates } from "nuqs";
import { LayoutGrid, Table2 } from "lucide-react";
import { AddButton, ListingCard, pen } from "@/components/listing-card";
import { ScoreBadge } from "@/components/score-badge";
import { SourceBadges } from "@/components/source-badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInicioInversion } from "./inicio-inversion";
import { HomeFilterRow, type FilterPatch } from "./home-filters";
import { hasActiveFilters, homeFilterParsers, serializeHomeFilters } from "@/lib/home-filters";
import type { SourceId } from "@/lib/listing-card";
import { grossYieldPct } from "@/lib/gross-yield";
import { COLS_MAX, COLS_MIN, nextCols, parseCols } from "@/lib/inicio-cols";
import { moneyLine, RECO_TABS } from "@/lib/home";
import type { HomeRow } from "@/lib/home-rows";

function yieldText(rent: number | null, price: number): string {
  const y = grossYieldPct(rent, price);
  return y == null ? "-" : `${y.toFixed(1)} %`;
}

const FIRST = 16;
const STEP = 8;
const VIEW_KEY = "dptos.inicio.view";
const COLS_KEY = "dptos.inicio.cols";

type View = "cards" | "table";

const PREF_EVENT = "dptos:inicio-pref";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PREF_EVENT, onChange);
  return () => window.removeEventListener(PREF_EVENT, onChange);
}

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A remembered choice; the server and the first paint see the default. */
function usePref(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key),
    () => null,
  );
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the choice just is not remembered.
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}

type Reco = { rows: HomeRow[]; hasMore: boolean };

const HEAD_HINTS: Record<string, string> = {
  "Alquiler est.":
    "Alquiler estimado por mes para un departamento de este tamaño en la zona",
  Ganancia:
    "Alquiler menos la cuota del banco y los gastos, por mes, con tus supuestos",
  Rentabilidad: "Alquiler de un año dividido entre el precio",
  "Efectivo día 1": "Inicial más gastos de compra",
  Ubicación: "Puntaje de ubicación de 0 a 10",
};

function Head({ label }: { label: string }) {
  const hint = HEAD_HINTS[label];
  return (
    <TableHead>
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help underline decoration-dotted underline-offset-4">
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
      ) : (
        label
      )}
    </TableHead>
  );
}

const CLEARED: FilterPatch = {
  precio_min: null,
  precio_max: null,
  dorm_min: null,
  dorm_max: null,
  distrito: null,
  area_min: null,
  area_max: null,
  fuente: null,
  ubicacion_min: null,
};

/**
 * The server sends the first page for the URL's filters and tab; the rest is fetched as the
 * person asks. The filters and the tab live in the URL, so a search can be shared as a link.
 */
export function Recommendations({
  initial,
  districtOptions,
  sourceOptions,
}: {
  initial: Reco;
  districtOptions: { value: string; label: string }[];
  sourceOptions: SourceId[];
}) {
  const { isAdded, toggle } = useInicioInversion();
  const [filters, setFilters] = useQueryStates(homeFilterParsers, { shallow: true, history: "push" });
  const mode = filters.orden;
  const [data, setData] = useState<Reco>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const storedView = usePref(VIEW_KEY);
  const view: View = storedView === "table" ? "table" : "cards";
  const cols = parseCols(usePref(COLS_KEY));
  // While the person types, the field shows their text; the grid uses the last valid value.
  const [colsDraft, setColsDraft] = useState<string | null>(null);

  // Only the newest request may write the list, so a slow answer never shows stale filters.
  const requestId = useRef(0);
  async function load(n: number) {
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(serializeHomeFilters(`/api/inicio/recomendados?n=${n}`, filters));
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as Reco;
      if (id === requestId.current) setData(next);
    } catch {
      if (id === requestId.current) setFailed(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  // A change of filters or tab reloads the first page. The server already rendered the first one.
  const searchKey = serializeHomeFilters(filters);
  const loadedKey = useRef(searchKey);
  useEffect(() => {
    if (loadedKey.current === searchKey) return;
    loadedKey.current = searchKey;
    void load(FIRST);
    // load reads the same filters that make searchKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  const active = hasActiveFilters(filters);
  const clear = () => void setFilters(CLEARED);

  const list = data.rows;
  const hasMore = data.hasMore;

  return (
    <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recomendados</h2>
        <HomeFilterRow
          filters={filters}
          districtOptions={districtOptions}
          sourceOptions={sourceOptions}
          active={active}
          onChange={(patch) => void setFilters(patch)}
          onClear={clear}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {RECO_TABS.map((t) => (
              <button
                key={t.mode}
                type="button"
                onClick={() => {
                  if (t.mode !== mode) void setFilters({ orden: t.mode });
                }}
                className={`rounded-full border px-3 py-1 text-sm ${
                  mode === t.mode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {view === "cards" && (
              <label className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                Columnas
                <input
                  type="number"
                  min={COLS_MIN}
                  max={COLS_MAX}
                  step={1}
                  value={colsDraft ?? String(cols)}
                  onChange={(e) => {
                    setColsDraft(e.target.value);
                    remember(COLS_KEY, String(nextCols(e.target.value, cols)));
                  }}
                  onBlur={() => setColsDraft(null)}
                  className="h-8 w-14 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                />
              </label>
            )}
            {(
              [
                ["cards", LayoutGrid, "Tarjetas"],
                ["table", Table2, "Tabla"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-label={label}
                aria-pressed={view === v}
                onClick={() => {
                  remember(VIEW_KEY, v);
                }}
                className={`inline-flex size-8 items-center justify-center rounded-md border ${view === v ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>

        {view === "cards" ? (
          <div
            className="grid grid-cols-1 gap-3 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
            style={{ ["--cols" as string]: cols }}
          >
            {list.map((r) => (
              <ListingCard
                key={r.postingId}
                row={r}
                added={isAdded(r.propertyId)}
                onAdd={() => toggle(r)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <Head label="Departamento" />
                  <Head label="Fuente" />
                  <Head label="Precio" />
                  <Head label="Alquiler est." />
                  <Head label="Ganancia" />
                  <Head label="Rentabilidad" />
                  <Head label="Efectivo día 1" />
                  <Head label="Ubicación" />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => {
                  const money = moneyLine(r.monthlyGainPen);
                  return (
                    <TableRow key={r.postingId}>
                      <TableCell>
                        <div className="size-10 overflow-hidden rounded-md bg-gradient-to-br from-muted to-secondary">
                          {r.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.imageUrl}
                              alt=""
                              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
                              className="size-full object-cover"
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {r.districtName}
                          </a>
                        ) : (
                          r.districtName
                        )}
                        <div className="text-xs text-muted-foreground">
                          {r.bedrooms ?? "-"} dorm · {r.areaM2 ?? "-"} m²
                        </div>
                      </TableCell>
                      <TableCell>
                        <SourceBadges badges={r.sources} />
                      </TableCell>
                      <TableCell>{pen(r.pricePen)}</TableCell>
                      <TableCell>
                        {r.grossRentPen == null ? "-" : pen(r.grossRentPen)}
                      </TableCell>
                      <TableCell
                        className={
                          money
                            ? money.tone === "gain"
                              ? "text-gain"
                              : "text-loss"
                            : ""
                        }
                      >
                        {money ? money.text : "-"}
                      </TableCell>
                      <TableCell>
                        {yieldText(r.grossRentPen, r.pricePen)}
                      </TableCell>
                      <TableCell>
                        {r.entryCostPen == null ? "-" : pen(r.entryCostPen)}
                      </TableCell>
                      <TableCell>
                        <ScoreBadge
                          score={r.locationScore}
                          reasons={r.locationReasons}
                        />
                      </TableCell>
                      <TableCell className="group">
                        {r.propertyId && (
                          <AddButton
                            added={isAdded(r.propertyId)}
                            onAdd={() => toggle(r)}
                            always
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && !failed && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <p>Ningún departamento cumple estos filtros.</p>
            {active && (
              <button type="button" onClick={clear} className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-accent">
                Limpiar filtros
              </button>
            )}
          </div>
        )}
        {failed && (
          <p className="text-center text-sm text-loss">
            No se pudieron cargar los recomendados.
          </p>
        )}
        {hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(list.length + STEP)}
              className="rounded-md border border-border px-4 py-1.5 text-sm hover:bg-accent"
            >
              Ver más
            </button>
          </div>
        )}
      </section>
  );
}
