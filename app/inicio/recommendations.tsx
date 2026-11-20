"use client";

import { useState, useSyncExternalStore } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import { AddButton, ListingCard, pen } from "@/components/listing-card";
import { ScoreBadge } from "@/components/score-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { moneyLine, recommend, RECO_TABS, type RecoMode } from "@/lib/home";
import type { HomeRow } from "@/lib/home-rows";

const FIRST = 16;
const STEP = 8;
const VIEW_KEY = "dptos.inicio.view";
const COLS_KEY = "dptos.inicio.cols";
const COLS = [2, 3, 4, 5, 6];

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
  return useSyncExternalStore(subscribe, () => readPref(key), () => null);
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the choice just is not remembered.
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}

export function Recommendations({ rows }: { rows: HomeRow[] }) {
  const [mode, setMode] = useState<RecoMode>("gain");
  const [shown, setShown] = useState(FIRST);
  const storedView = usePref(VIEW_KEY);
  const view: View = storedView === "table" ? "table" : "cards";
  const storedCols = Number(usePref(COLS_KEY));
  const cols = COLS.includes(storedCols) ? storedCols : 4;

  const { rows: list, hasMore } = recommend(rows, mode, shown);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Recomendados</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RECO_TABS.map((t) => (
            <button
              key={t.mode}
              type="button"
              onClick={() => {
                setMode(t.mode);
                setShown(FIRST);
              }}
              className={`rounded-full border px-3 py-1 text-sm ${
                mode === t.mode ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {view === "cards" && (
            <div className="hidden items-center gap-1 sm:flex" aria-label="Columnas">
              {COLS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cols === c}
                  onClick={() => {
                    remember(COLS_KEY, String(c));
                  }}
                  className={`size-7 rounded-md border text-xs ${cols === c ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {([["cards", LayoutGrid, "Tarjetas"], ["table", Table2, "Tabla"]] as const).map(([v, Icon, label]) => (
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
            <ListingCard key={r.postingId} row={r} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Departamento</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Alquiler est.</TableHead>
                <TableHead>Ganancia</TableHead>
                <TableHead>Rentabilidad</TableHead>
                <TableHead>Efectivo día 1</TableHead>
                <TableHead>Ubicación</TableHead>
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
                          <img src={r.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {r.districtName}
                        </a>
                      ) : (
                        r.districtName
                      )}
                      <div className="text-xs text-muted-foreground">
                        {r.bedrooms ?? "-"} dorm · {r.areaM2 ?? "-"} m²
                      </div>
                    </TableCell>
                    <TableCell>{pen(r.pricePen)}</TableCell>
                    <TableCell>{r.grossRentPen == null ? "-" : pen(r.grossRentPen)}</TableCell>
                    <TableCell className={money ? (money.tone === "gain" ? "text-gain" : "text-loss") : ""}>
                      {money ? money.text : "-"}
                    </TableCell>
                    <TableCell>
                      {r.grossRentPen != null && r.pricePen > 0
                        ? `${(((r.grossRentPen * 12) / r.pricePen) * 100).toFixed(1)} %`
                        : "-"}
                    </TableCell>
                    <TableCell>{r.entryCostPen == null ? "-" : pen(r.entryCostPen)}</TableCell>
                    <TableCell>
                      <ScoreBadge score={r.locationScore} reasons={r.locationReasons} />
                    </TableCell>
                    <TableCell className="group">
                      <AddButton propertyId={r.propertyId} always />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + STEP)}
            className="rounded-md border border-border px-4 py-1.5 text-sm hover:bg-accent"
          >
            Ver más
          </button>
        </div>
      )}
    </section>
  );
}
