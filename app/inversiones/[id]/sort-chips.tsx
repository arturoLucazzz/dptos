"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvestmentFilters } from "@/lib/investments/filters";
import { WORKSPACE_SORTS } from "@/lib/workspace-sorts";

/** A project has only a "desde" price and a date, so it sorts by those two. */
export const PROJECT_SORT_IDS: readonly string[] = ["pricePen", "newest"];

export function sortsFor(kind: InvestmentFilters["kind"]) {
  return kind === "projects" ? WORKSPACE_SORTS.filter((s) => PROJECT_SORT_IDS.includes(s.id)) : WORKSPACE_SORTS;
}

/** One chip per sort; a second click on the active chip flips the order. */
export function SortChips({
  filters,
  onChange,
}: {
  filters: InvestmentFilters;
  onChange: (patch: Pick<InvestmentFilters, "sort" | "order">) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
      <span className="shrink-0 self-center text-xs text-muted-foreground">Ordenar:</span>
      {sortsFor(filters.kind).map((s) => {
        const active = filters.sort === s.id;
        const Arrow = filters.order === "asc" ? ArrowUp : ArrowDown;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(
                active
                  ? { sort: s.id, order: filters.order === "asc" ? "desc" : "asc" }
                  : { sort: s.id, order: s.order }
              )
            }
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
            {active && <Arrow aria-label={filters.order === "asc" ? "ascendente" : "descendente"} className="size-3" />}
          </button>
        );
      })}
    </div>
  );
}
