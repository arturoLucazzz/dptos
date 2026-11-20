"use client";

import { useRef, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import { ProjectCard } from "@/components/project-card";
import type { InvestmentFilters } from "@/lib/investments/filters";
import { toPickView, type PickView } from "@/lib/investments/pick-view";
import type { CardRow, CardsPage } from "@/lib/investments/workspace-data";
import type { DepartamentosRow } from "@/lib/departamentos-query";
import { addPick, removePick, renameInvestment, setPickNote } from "../actions";
import { FilterChips } from "./filter-chips";
import { PROJECT_SORT_IDS, SortChips } from "./sort-chips";
import { PickPanel } from "./pick-panel";

type Item = { id: string; propertyId: string | null; projectId: string | null };

const TEMP = "temp:";
const isTemp = (itemId: string) => itemId.startsWith(TEMP);

function insertAt<T>(list: T[], index: number, value: T): T[] {
  const at = Math.min(Math.max(0, index), list.length);
  return [...list.slice(0, at), value, ...list.slice(at)];
}

function cardKey(c: CardRow): string {
  return c.type === "unit" ? `u:${c.row.postingId}` : `p:${c.row.projectId}`;
}

export function Workspace({
  investment,
  initialFilters,
  initialCards,
  initialPicks,
  districtOptions,
}: {
  investment: { id: string; name: string; items: Item[] };
  initialFilters: InvestmentFilters;
  initialCards: CardsPage;
  initialPicks: PickView[];
  districtOptions: { value: string; label: string }[];
}) {
  const id = investment.id;
  const [name, setName] = useState(investment.name);
  const [filters, setFilters] = useState(initialFilters);
  const [cards, setCards] = useState(initialCards);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [items, setItems] = useState<Item[]>(investment.items);
  const [picks, setPicks] = useState<PickView[]>(initialPicks);
  const [saveError, setSaveError] = useState(false);
  const tempCounter = useRef(0);
  // Each request takes a number; only the newest one may write the cards.
  const requestId = useRef(0);

  const fetchCards = async (next: InvestmentFilters, nextPage: number) => {
    const mine = ++requestId.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/inversiones/${id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: next, page: nextPage }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as CardsPage;
      if (mine !== requestId.current) return;
      setCards((prev) => (nextPage === 1 ? data : { ...data, rows: [...prev.rows, ...data.rows] }));
      setPage(nextPage);
    } catch {
      if (mine === requestId.current) setFailed(true);
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  };

  const change = (patch: Partial<InvestmentFilters>) => {
    const next = { ...filters, ...patch };
    // Switching to projects keeps a sort that projects have.
    if (patch.kind === "projects" && !PROJECT_SORT_IDS.includes(next.sort)) {
      next.sort = "pricePen";
      next.order = "asc";
    }
    setFilters(next);
    void fetchCards(next, 1);
  };

  const itemFor = (c: CardRow): Item | undefined =>
    c.type === "unit"
      ? items.find((i) => i.propertyId != null && i.propertyId === c.row.propertyId)
      : items.find((i) => i.projectId === c.row.projectId);

  // A failed save shows a short message; the screen stays usable and matches the database.
  const failSave = () => setSaveError(true);

  const toggle = async (c: CardRow) => {
    const existing = itemFor(c);
    if (existing) {
      if (!isTemp(existing.id)) void remove(existing.id);
      return;
    }
    if (c.type === "unit" && !c.row.propertyId) return;
    const target = c.type === "unit" ? { propertyId: c.row.propertyId as string } : { projectId: c.row.projectId };
    // Flip the + at once with a temporary item; the server item replaces it.
    const temp: Item = {
      id: `${TEMP}${++tempCounter.current}`,
      propertyId: c.type === "unit" ? c.row.propertyId : null,
      projectId: c.type === "project" ? c.row.projectId : null,
    };
    const view = (item: Item & { note: string | null }) =>
      // The card row has every field the panel shows.
      toPickView(
        item,
        c.type === "unit" ? (c.row as unknown as DepartamentosRow) : null,
        c.type === "project" ? c.row : null,
        { districtName: c.row.districtName }
      );
    setSaveError(false);
    setItems((list) => [...list, temp]);
    setPicks((list) => [...list, view({ ...temp, note: null })]);
    try {
      const item = await addPick(id, target);
      // A repeat add returns the existing item: keep one row for it.
      setItems((list) => {
        const rest = list.filter((i) => i.id !== temp.id && i.id !== item.id);
        return [...rest, item];
      });
      setPicks((list) => {
        const known = list.find((p) => p.itemId === item.id);
        const rest = list.filter((p) => p.itemId !== temp.id && p.itemId !== item.id);
        return [...rest, known ?? view(item)];
      });
    } catch {
      setItems((list) => list.filter((i) => i.id !== temp.id));
      setPicks((list) => list.filter((p) => p.itemId !== temp.id));
      failSave();
    }
  };

  const remove = async (itemId: string) => {
    if (isTemp(itemId)) return;
    const itemAt = items.findIndex((i) => i.id === itemId);
    const pickAt = picks.findIndex((p) => p.itemId === itemId);
    const item = items[itemAt];
    const pick = picks[pickAt];
    setSaveError(false);
    setItems((list) => list.filter((i) => i.id !== itemId));
    setPicks((list) => list.filter((p) => p.itemId !== itemId));
    try {
      await removePick(itemId);
    } catch {
      // Put the pick back where it was, keeping any change made meanwhile.
      if (item) setItems((list) => (list.some((i) => i.id === itemId) ? list : insertAt(list, itemAt, item)));
      if (pick) setPicks((list) => (list.some((p) => p.itemId === itemId) ? list : insertAt(list, pickAt, pick)));
      failSave();
    }
  };

  const note = async (itemId: string, value: string) => {
    if (isTemp(itemId)) return;
    setSaveError(false);
    try {
      const saved = await setPickNote(itemId, value);
      setPicks((list) => list.map((p) => (p.itemId === itemId ? { ...p, note: saved.note } : p)));
    } catch {
      failSave();
    }
  };

  const rename = async (value: string) => {
    setSaveError(false);
    try {
      const saved = await renameInvestment(id, value);
      setName(saved.name);
    } catch {
      failSave();
    }
  };

  const noun = filters.kind === "projects" ? (cards.total === 1 ? "proyecto" : "proyectos") : cards.total === 1 ? "departamento" : "departamentos";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-2">
          <FilterChips filters={filters} districtOptions={districtOptions} onChange={change} />
          <SortChips filters={filters} onChange={change} />
        </div>

        {/* Task 5: the map goes here, above the cards. */}

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {cards.total.toLocaleString("es-PE")} {noun}
          {loading && " · cargando…"}
        </p>

        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${loading && page === 1 ? "opacity-60" : ""}`}>
          {cards.rows.map((c) =>
            c.type === "unit" ? (
              <ListingCard key={cardKey(c)} row={c.row} added={itemFor(c) != null} onAdd={() => void toggle(c)} />
            ) : (
              <ProjectCard key={cardKey(c)} row={c.row} added={itemFor(c) != null} onAdd={() => void toggle(c)} />
            )
          )}
        </div>

        {cards.rows.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nada con estos filtros.</p>
        )}
        {failed && <p className="text-center text-sm text-loss">No se pudieron cargar las tarjetas. Intenta otra vez.</p>}
        {cards.hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchCards(filters, page + 1)}
              className="rounded-md border border-border px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              Ver más
            </button>
          </div>
        )}
      </div>

      <aside className="w-full lg:sticky lg:top-20 lg:w-80 lg:shrink-0">
        <PickPanel
          id={id}
          name={name}
          picks={picks}
          saveError={saveError}
          onRename={(v) => void rename(v)}
          onRemove={(itemId) => void remove(itemId)}
          onNote={(itemId, v) => void note(itemId, v)}
        />
      </aside>
    </div>
  );
}
