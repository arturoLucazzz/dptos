"use client";

import { useMemo } from "react";
import { useFavorites } from "@/app/providers";
import type { ApartmentData } from "@/app/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, HeartOff } from "lucide-react";

export function FavoritosClient({ apartments }: { apartments: ApartmentData[] }) {
  const { favoriteIds, toggleFavorite } = useFavorites();

  const favorites = useMemo(
    () => apartments.filter((a) => favoriteIds.has(a.id)),
    [apartments, favoriteIds]
  );

  if (favorites.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
        <p className="text-muted-foreground">
          No tienes favoritos. Marca departamentos en la pestaña Departamentos para verlos aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{favorites.length} favorito{favorites.length !== 1 ? "s" : ""}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {favorites.map((apt) => (
          <Card key={apt.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <h3 className="line-clamp-2 text-sm font-medium leading-tight">
                {apt.title ?? "Sin título"}
              </h3>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => toggleFavorite(apt.id)}
                  aria-label="Quitar de favoritos"
                >
                  <HeartOff className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a href={apt.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir enlace">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              <p>{apt.limaDistrictName ?? apt.location}</p>
              <p className="font-medium text-foreground">{apt.priceFormatted ?? "—"}</p>
              {(apt.developmentStage ?? apt.deliveryDate) && (
                <p className="text-xs">
                  {apt.developmentStage}
                  {apt.deliveryDate ? ` · ${apt.deliveryDate}` : ""}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
