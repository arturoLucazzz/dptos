"use client";

import Link from "next/link";
import { useFavorites } from "@/app/providers";
import { Button } from "@/components/ui/button";

/** Until step 2 adds inversiones, the favorites stand in for them. */
export function ContinueCard({ favorites }: { favorites: { id: string; imageUrl: string | null }[] }) {
  const { favoriteIds } = useFavorites();
  // Count and thumbnails come from the same list, so they always agree.
  const thumbs = favorites.filter((f) => favoriteIds.has(f.id));
  const n = thumbs.length;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Continuar</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Favoritos</p>
            <p className="text-sm text-muted-foreground">{n} elegidos</p>
          </div>
          <div className="flex items-center gap-3">
            {n > 0 && (
              <div className="flex -space-x-2">
                {thumbs.slice(0, 5).map((t) => (
                  <span key={t.id} className="size-9 overflow-hidden rounded-full border-2 border-card bg-gradient-to-br from-muted to-secondary">
                    {t.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.imageUrl} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="size-full object-cover" />
                    )}
                  </span>
                ))}
              </div>
            )}
            <Link
              href="/favoritos"
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
            >
              Abrir
            </Link>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Otras inversiones</p>
        <p className="mt-1 text-sm text-muted-foreground">Podrás crear varias inversiones en el siguiente paso.</p>
        <Button size="sm" variant="outline" className="mt-3" disabled>
          + Nueva inversión
        </Button>
      </div>
    </div>
  );
}
