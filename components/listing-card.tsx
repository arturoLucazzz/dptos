"use client";

import { Plus, Check } from "lucide-react";
import { useFavorites } from "@/app/providers";
import { ScoreBadge } from "@/components/score-badge";
import { moneyLine } from "@/lib/home";
import type { HomeRow } from "@/lib/home-rows";

export function pen(n: number): string {
  return `S/ ${Math.round(n).toLocaleString("es-PE")}`;
}

/** The add-to-favorites button; visible on hover and always on touch screens. */
export function AddButton({ propertyId, always = false }: { propertyId: string | null; always?: boolean }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  if (!propertyId) return null;
  const on = isFavorite(propertyId);
  return (
    <button
      type="button"
      aria-label={on ? "Quitar de favoritos" : "Agregar a favoritos"}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(propertyId);
      }}
      className={`inline-flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow backdrop-blur hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 ${
        always ? "" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      } ${on ? "!opacity-100 bg-primary text-primary-foreground" : ""}`}
    >
      {on ? <Check className="size-4" /> : <Plus className="size-4" />}
    </button>
  );
}

export function ListingCard({ row }: { row: HomeRow }) {
  const money = moneyLine(row.monthlyGainPen);
  const open = () => {
    if (row.url) window.open(row.url, "_blank", "noopener,noreferrer");
  };
  return (
    <div
      role={row.url ? "link" : undefined}
      tabIndex={row.url ? 0 : undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) open();
      }}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="relative aspect-[4/3] bg-gradient-to-br from-muted to-secondary">
        {row.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.imageUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="size-full object-cover" />
        )}
        <div className="absolute left-2 top-2">
          <AddButton propertyId={row.propertyId} />
        </div>
        <div className="absolute right-2 top-2">
          <ScoreBadge score={row.locationScore} reasons={row.locationReasons} />
        </div>
      </div>
      <div className="space-y-0.5 p-3">
        <p className="text-base font-semibold">{pen(row.pricePen)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.bedrooms ?? "-"} dorm · {row.areaM2 ?? "-"} m² · {row.districtName}
        </p>
        {money && (
          <p className={`text-xs font-medium ${money.tone === "gain" ? "text-gain" : "text-loss"}`}>{money.text}</p>
        )}
      </div>
    </div>
  );
}
