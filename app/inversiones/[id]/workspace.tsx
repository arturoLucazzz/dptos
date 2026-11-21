"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { DndContext, DragOverlay, pointerWithin, rectIntersection, type CollisionDetection, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronUp, X } from "lucide-react";
import { ListingCard } from "@/components/listing-card";
import { ProjectCard } from "@/components/project-card";
import type { InvestmentFilters } from "@/lib/investments/filters";
import { toPickView, type PickView } from "@/lib/investments/pick-view";
import type { CardRow, CardsPage } from "@/lib/investments/workspace-data";
import type { ZoneOutlineInput } from "@/lib/investments/map-features";
import { saveDrawnZone } from "../zone-actions";
import type { DepartamentosRow } from "@/lib/departamentos-query";
import { addPick, removePick, renameInvestment, setPickNote } from "../actions";
import { FilterChips } from "./filter-chips";
import { PROJECT_SORT_IDS, SortChips } from "./sort-chips";
import { PickPanel } from "./pick-panel";
import { markInversionesChanged } from "../history-refresh";

type Item = { id: string; propertyId: string | null; projectId: string | null };

// Client only, so the server bundle never loads maplibre.
const WorkspaceMap = dynamic(() => import("./workspace-map").then((m) => m.WorkspaceMap), {
  ssr: false,
  // The toolbar row plus the map box, so the page does not jump when the map arrives.
  loading: () => <div className="mt-9 h-80 animate-pulse rounded-xl border border-border bg-muted/40 lg:h-[30rem]" />,
});

const DESKTOP = "(min-width: 768px)";
function subscribeDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** The map starts open on a desktop and folded on a phone; the server renders it folded. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
}

const WIDE = "(min-width: 1024px)";
function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** At lg and up the panel sits beside the cards; below it is a bottom sheet. */
function useIsWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
}

const TEMP = "temp:";
const isTemp = (itemId: string) => itemId.startsWith(TEMP);

function insertAt<T>(list: T[], index: number, value: T): T[] {
  const at = Math.min(Math.max(0, index), list.length);
  return [...list.slice(0, at), value, ...list.slice(at)];
}

/** One key per pick target, so a temporary item and its server item share a panel row. */
function targetKey(i: { propertyId: string | null; projectId: string | null }): string {
  return i.propertyId ? `u:${i.propertyId}` : `p:${i.projectId}`;
}

function cardKey(c: CardRow): string {
  return c.type === "unit" ? `u:${c.row.postingId}` : `p:${c.row.projectId}`;
}

/** What is under the pointer wins; the card rectangle is only the fallback. */
const collide: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

/** A card the user can pick up. The listeners sit on the wrapper, so the link, the add button and the badge keep their own clicks. */
function DraggableCard({ dragId, children }: { dragId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // The wrapper is not a tab stop or a button: the card inside already has its own controls.
      tabIndex={undefined}
      role={undefined}
      aria-roledescription={undefined}
      className={`touch-manipulation ${isDragging ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
}

/** A drop area for the pick panel. While a card is dragged it shows the hint. */
function DropZone({ dropId, dragging, className, children }: { dropId: string; dragging: boolean; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  return (
    <div ref={setNodeRef} className={`relative ${className ?? ""} ${dragging && isOver ? "rounded-xl ring-2 ring-primary" : ""}`}>
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-background/80 p-2 text-center text-sm font-medium">
          Suelta aquí para agregar
        </div>
      )}
    </div>
  );
}

export function Workspace({
  investment,
  initialFilters,
  initialCards,
  initialPicks,
  districtOptions,
  zones,
}: {
  investment: { id: string; name: string; items: Item[] };
  initialFilters: InvestmentFilters;
  initialCards: CardsPage;
  initialPicks: PickView[];
  districtOptions: { value: string; label: string }[];
  zones: ZoneOutlineInput[];
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
  // Notes typed on a temporary pick wait here, by target, until the server item arrives.
  const queuedNotes = useRef(new Map<string, string>());
  // Each request takes a number; only the newest one may write the cards.
  const requestId = useRef(0);
  // The filters the shown cards belong to: a failed first page rolls the chips back to them.
  const shownFilters = useRef(initialFilters);
  const isDesktop = useIsDesktop();
  const [mapChoice, setMapChoice] = useState<boolean | null>(null);
  const mapOpen = mapChoice ?? isDesktop;
  const [pointsToken, setPointsToken] = useState(0);
  const [savedZones, setSavedZones] = useState(zones);
  const [dragId, setDragId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isWide = useIsWide();
  // The sheet is modal only on a phone; a wide screen shows the panel as a plain side column.
  const modal = sheetOpen && !isWide;
  const noticeTimer = useRef<number | undefined>(undefined);
  const sheetRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLButtonElement>(null);
  const wasModal = useRef(false);

  useEffect(() => {
    if (!modal) {
      // Back to the bar that opened the sheet.
      if (wasModal.current) barRef.current?.focus();
      wasModal.current = false;
      return;
    }
    wasModal.current = true;
    sheetRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheetOpen(false);
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      // Keep Tab inside the sheet.
      const items = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])')
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!sheetRef.current.contains(active) || (e.shiftKey && (active === first || active === sheetRef.current))) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [modal]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

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
      if (nextPage === 1) shownFilters.current = next;
    } catch {
      if (mine !== requestId.current) return;
      setFailed(true);
      // The old cards and count stay, so the chips go back to the filters they match.
      if (nextPage === 1) setFilters(shownFilters.current);
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

  /** The popup card: from the loaded rows when it is there, else from the cards route by id. */
  const cardFor = async (pinId: string): Promise<CardRow | null> => {
    const loaded = cards.rows.find((c) => (c.type === "unit" ? c.row.postingId : c.row.projectId) === pinId);
    if (loaded) return loaded;
    const res = await fetch(`/api/inversiones/${id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, ids: [pinId] }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as CardsPage;
    return data.rows[0] ?? null;
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
    await add(c);
  };

  /** The one add path: the + button, the map popup and a drop all come here. */
  const add = async (c: CardRow) => {
    if (c.type === "unit" && !c.row.propertyId) return;
    const target = c.type === "unit" ? { propertyId: c.row.propertyId as string } : { projectId: c.row.projectId };
    // Flip the + at once with a temporary item; the server item replaces it.
    const temp: Item = {
      id: `${TEMP}${++tempCounter.current}`,
      propertyId: c.type === "unit" ? c.row.propertyId : null,
      projectId: c.type === "project" ? c.row.projectId : null,
    };
    const view = (item: Item & { note: string | null }) =>
      // The card row carries the fields the panel reads, so it stands in for the panel row.
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
      // The server item takes the temporary item's place, so the order stays as clicked.
      setItems((list) =>
        list.some((i) => i.id === item.id)
          ? list.filter((i) => i.id !== temp.id)
          : list.map((i) => (i.id === temp.id ? item : i))
      );
      setPicks((list) =>
        list.some((p) => p.itemId === item.id)
          ? list.filter((p) => p.itemId !== temp.id)
          : // Keep the note shown on the temporary row until the queued save answers.
            list.map((p) => (p.itemId === temp.id ? { ...view(item), note: p.note ?? item.note } : p))
      );
      markInversionesChanged();
      const queued = queuedNotes.current.get(targetKey(temp));
      if (queued !== undefined) {
        queuedNotes.current.delete(targetKey(temp));
        void note(item.id, queued);
      }
    } catch {
      queuedNotes.current.delete(targetKey(temp));
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
      markInversionesChanged();
    } catch {
      // Put the pick back where it was, keeping any change made meanwhile.
      if (item) setItems((list) => (list.some((i) => i.id === itemId) ? list : insertAt(list, itemAt, item)));
      if (pick) setPicks((list) => (list.some((p) => p.itemId === itemId) ? list : insertAt(list, pickAt, pick)));
      failSave();
    }
  };

  const note = async (itemId: string, value: string) => {
    if (isTemp(itemId)) {
      const item = items.find((i) => i.id === itemId);
      if (item) queuedNotes.current.set(targetKey(item), value);
      setPicks((list) => list.map((p) => (p.itemId === itemId ? { ...p, note: value.trim() || null } : p)));
      return;
    }
    setSaveError(false);
    try {
      const saved = await setPickNote(itemId, value);
      markInversionesChanged();
      setPicks((list) => list.map((p) => (p.itemId === itemId ? { ...p, note: saved.note } : p)));
    } catch {
      failSave();
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    if (!e.over) return;
    const c = cards.rows.find((r) => cardKey(r) === e.active.id);
    if (!c) return;
    // A drop never removes: a card already in the inversión only shows a note.
    if (itemFor(c)) {
      setNotice("Ya está en la inversión");
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
      return;
    }
    void add(c);
  };

  const dragged = dragId ? cards.rows.find((r) => cardKey(r) === dragId) : undefined;

  const rename = async (value: string) => {
    setSaveError(false);
    try {
      const saved = await renameInvestment(id, value);
      setName(saved.name);
      markInversionesChanged();
    } catch {
      failSave();
    }
  };

  const foldButton = (
    <button
      type="button"
      onClick={() => setMapChoice(!mapOpen)}
      aria-expanded={mapOpen}
      className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
    >
      {mapOpen ? "Ocultar mapa" : "Mostrar mapa"}
    </button>
  );

  const noun = filters.kind === "projects" ? (cards.total === 1 ? "proyecto" : "proyectos") : cards.total === 1 ? "departamento" : "departamentos";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={(e) => setDragId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragId(null)}
    >
    <div className="flex flex-col gap-6 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:flex-row lg:items-start lg:pb-0">
      <div className="min-w-0 flex-1 space-y-4" inert={modal}>
        <div className="space-y-2">
          <FilterChips filters={filters} districtOptions={districtOptions} onChange={change} />
          <SortChips filters={filters} onChange={change} />
        </div>

        {mapOpen ? (
          <WorkspaceMap
            toolbarStart={foldButton}
            investmentId={id}
            filters={filters}
            refreshToken={pointsToken}
            zones={savedZones}
            cardFor={cardFor}
            isAdded={(c) => itemFor(c) != null}
            onToggle={(c) => void toggle(c)}
            onAreaChange={(area) => change({ area })}
            onZoneSaved={(zone) => {
              setSavedZones((list) => [...list, zone]);
              // New scores: read page 1 and the pins again, without re-rendering the route.
              void fetchCards(filters, 1);
              setPointsToken((n) => n + 1);
            }}
            saveZone={saveDrawnZone}
          />
        ) : (
          <div className="flex items-center gap-2">
            {foldButton}
            {filters.area && (
              <button type="button" onClick={() => change({ area: null })} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent">
                Quitar zona
              </button>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {cards.total.toLocaleString("es-PE")} {noun}
          {loading && " · cargando…"}
        </p>

        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${loading && page === 1 ? "opacity-60" : ""}`}>
          {cards.rows.map((c) =>
            c.type === "unit" ? (
              <DraggableCard key={cardKey(c)} dragId={cardKey(c)}>
                <ListingCard row={c.row} added={itemFor(c) != null} onAdd={() => void toggle(c)} />
              </DraggableCard>
            ) : (
              <DraggableCard key={cardKey(c)} dragId={cardKey(c)}>
                <ProjectCard row={c.row} added={itemFor(c) != null} onAdd={() => void toggle(c)} />
              </DraggableCard>
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

      {/* Phone: a backdrop behind the open sheet. */}
      {sheetOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSheetOpen(false)} aria-hidden />}
      <aside
        ref={sheetRef}
        tabIndex={-1}
        role={modal ? "dialog" : undefined}
        aria-modal={modal ? true : undefined}
        aria-label={modal ? `Elegidos de ${name}` : undefined}
        className={`outline-none max-lg:bg-background max-lg:pb-[env(safe-area-inset-bottom)] ${sheetOpen ? "" : "max-lg:hidden"} max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 lg:sticky lg:top-20 lg:w-80 lg:shrink-0`}
      >
        <DropZone dropId="panel" dragging={dragId != null} className="max-lg:rounded-t-2xl max-lg:bg-background">
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Cerrar"
            className="absolute right-2 top-2 z-20 inline-flex size-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:bg-accent lg:hidden"
          >
            <X className="size-4" />
          </button>
          <PickPanel
            id={id}
            name={name}
            picks={picks}
            rowKey={(itemId) => {
              const item = items.find((i) => i.id === itemId);
              return item ? targetKey(item) : itemId;
            }}
            saveError={saveError}
            onRename={(v) => void rename(v)}
            onRemove={(itemId) => void remove(itemId)}
            onNote={(itemId, v) => void note(itemId, v)}
          />
        </DropZone>
      </aside>

      {/* Outside the aside, so it shows while the sheet is closed. */}
      <p
        role="status"
        className={`fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground shadow-lg lg:bottom-6 lg:left-auto lg:right-6 lg:w-72 ${notice ? "" : "hidden"}`}
      >
        {notice}
      </p>

      {/* Phone: the bar that opens the sheet; it takes drops too. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden" inert={modal}>
        <DropZone dropId="bar" dragging={dragId != null}>
          <button ref={barRef} type="button" onClick={() => setSheetOpen(true)} className="flex h-14 w-full items-center justify-between px-4 text-sm font-medium">
            <span>{picks.length === 1 ? "1 elegido" : `${picks.length} elegidos`}</span>
            <ChevronUp className="size-4" />
          </button>
        </DropZone>
      </div>
    </div>
    <DragOverlay>
      {dragged ? (
        <div className="w-max rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold shadow-lg">
          {dragged.type === "unit" ? `S/ ${Math.round(dragged.row.pricePen).toLocaleString("es-PE")}` : dragged.row.name}
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
