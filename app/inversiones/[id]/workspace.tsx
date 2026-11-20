"use client";

import { useRef, useState, useTransition } from "react";
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
  const [, startTransition] = useTransition();
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

  const toggle = (c: CardRow) => {
    const existing = itemFor(c);
    if (existing) {
      remove(existing.id);
      return;
    }
    if (c.type === "unit" && !c.row.propertyId) return;
    const target = c.type === "unit" ? { propertyId: c.row.propertyId as string } : { projectId: c.row.projectId };
    startTransition(async () => {
      const item = await addPick(id, target);
      setItems((list) => (list.some((i) => i.id === item.id) ? list : [...list, item]));
      setPicks((list) =>
        list.some((p) => p.itemId === item.id)
          ? list
          : [
              ...list,
              // The card row has every field the panel shows.
              toPickView(
                item,
                c.type === "unit" ? (c.row as unknown as DepartamentosRow) : null,
                c.type === "project" ? c.row : null,
                { districtName: c.row.districtName }
              ),
            ]
      );
    });
  };

  const remove = (itemId: string) => {
    setItems((list) => list.filter((i) => i.id !== itemId));
    setPicks((list) => list.filter((p) => p.itemId !== itemId));
    startTransition(async () => {
      await removePick(itemId);
    });
  };

  const note = (itemId: string, value: string) =>
    startTransition(async () => {
      const saved = await setPickNote(itemId, value);
      setPicks((list) => list.map((p) => (p.itemId === itemId ? { ...p, note: saved.note } : p)));
    });

  const rename = (value: string) =>
    startTransition(async () => {
      const saved = await renameInvestment(id, value);
      setName(saved.name);
    });

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
              <ListingCard key={cardKey(c)} row={c.row} added={itemFor(c) != null} onAdd={() => toggle(c)} />
            ) : (
              <ProjectCard key={cardKey(c)} row={c.row} added={itemFor(c) != null} onAdd={() => toggle(c)} />
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
        <PickPanel id={id} name={name} picks={picks} onRename={rename} onRemove={remove} onNote={note} />
      </aside>
    </div>
  );
}
