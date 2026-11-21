"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Check } from "lucide-react";
import { ScoreBadge } from "@/components/score-badge";
import { moneyLine } from "@/lib/home";
import type { HomeRow } from "@/lib/home-rows";
import { SourceBadges } from "@/components/source-badges";

export function pen(n: number): string {
  return `S/ ${Math.round(n).toLocaleString("es-PE")}`;
}

/** The add button; visible on hover and always on touch screens. */
export function AddButton({ added, onAdd, always = false }: { added: boolean; onAdd: () => void; always?: boolean }) {
  return (
    <button
      type="button"
      aria-label={added ? "Quitar de la inversión" : "Agregar a la inversión"}
      aria-pressed={added}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAdd();
      }}
      className={`inline-flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow backdrop-blur hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 ${
        always ? "" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 max-lg:opacity-100"
      } ${added ? "!opacity-100 bg-primary text-primary-foreground" : ""}`}
    >
      {added ? <Check className="size-4" /> : <Plus className="size-4" />}
    </button>
  );
}

/** The card photo; falls back to the gradient when it fails, also when it failed before hydration. */
export function CardPhoto({ src, className = "aspect-[4/3]" }: { src: string | null; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const img = ref.current;
    // An error before hydration fires no onError, so look at the element once on mount.
    if (img && img.complete && img.naturalWidth === 0) setFailed(img.getAttribute("src"));
  }, [src]);
  return (
    <div className={`bg-gradient-to-br from-muted to-secondary ${className}`}>
      {src && failed !== src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={ref} src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="size-full object-cover" />
      )}
    </div>
  );
}

/**
 * The card frame: the whole body is a real link to the listing, and the corner buttons sit
 * beside it, not inside it, so a tap on them never opens the listing.
 */
export function CardFrame({
  url,
  imageUrl,
  topLeft,
  topRight,
  footer,
  children,
}: {
  url: string | null;
  imageUrl: string | null;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  /** Shown under the body, outside the card link, so it can hold links of its own. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <CardPhoto src={imageUrl} />
      <div className="space-y-0.5 p-3">{children}</div>
    </>
  );
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </a>
      ) : (
        body
      )}
      {footer && <div className="px-3 pb-3">{footer}</div>}
      {topLeft && <div className="absolute left-2 top-2">{topLeft}</div>}
      {topRight && <div className="absolute right-2 top-2">{topRight}</div>}
    </div>
  );
}

export function ListingCard({ row, added, onAdd }: { row: HomeRow; added: boolean; onAdd(): void }) {
  const money = moneyLine(row.monthlyGainPen);
  return (
    <CardFrame
      url={row.url}
      imageUrl={row.imageUrl}
      // A row without a property cannot be a pick.
      topLeft={row.propertyId ? <AddButton added={added} onAdd={onAdd} /> : null}
      topRight={<ScoreBadge score={row.locationScore} reasons={row.locationReasons} />}
      footer={<SourceBadges badges={row.sources} />}
    >
      <p className="text-base font-semibold">{pen(row.pricePen)}</p>
      <p className="truncate text-xs text-muted-foreground">
        {row.bedrooms ?? "-"} dorm · {row.areaM2 ?? "-"} m² · {row.districtName}
      </p>
      {money && (
        <p className={`text-xs font-medium ${money.tone === "gain" ? "text-gain" : "text-loss"}`}>{money.text}</p>
      )}
    </CardFrame>
  );
}
