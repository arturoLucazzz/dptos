"use client";

import { useFavorites } from "@/app/providers";
import type { FixedAssumptions, PanelAssumptions } from "@/lib/assumption-defaults";
import { DEFAULT_PANEL } from "@/lib/assumption-defaults";
import type { ListingRow } from "@/lib/listing-row";
import { financeForListing, formatPen, formatPct } from "@/lib/listing-finance";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, HeartOff } from "lucide-react";

export function FavoritosClient({
  listings,
  fixedAssumptions,
  panel = DEFAULT_PANEL,
}: {
  listings: ListingRow[];
  fixedAssumptions: FixedAssumptions;
  panel?: PanelAssumptions;
}) {
  const { toggleFavorite } = useFavorites();

  if (listings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
        <p className="text-muted-foreground">
          No tienes favoritos. Márcalos en Departamentos; viven en el departamento físico, así
          que un repost no te los borra.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {listings.length} favorito{listings.length !== 1 ? "s" : ""}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => {
          const finance = financeForListing(listing, panel, fixedAssumptions);
          const url = listing.sourcePath ? `https://urbania.pe${listing.sourcePath}` : null;
          return (
            <Card key={listing.postingId}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <h3 className="line-clamp-2 text-sm font-medium leading-tight">
                  {listing.title ?? listing.address ?? "Sin título"}
                </h3>
                <div className="flex shrink-0 gap-1">
                  {listing.propertyId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleFavorite(listing.propertyId!)}
                      aria-label="Quitar de favoritos"
                    >
                      <HeartOff className="h-4 w-4" />
                    </Button>
                  )}
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abrir enlace"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-1 pt-0 text-sm text-muted-foreground">
                <p>{listing.districtName}</p>
                <p className="font-medium text-foreground">{formatPen(listing.pricePen)}</p>
                <p>
                  Cobertura {formatPct(finance?.coveragePct)} · aporte{" "}
                  {formatPen(finance?.monthlyContributionPen)}
                </p>
                {listing.discountPct != null && (
                  <p className="text-xs">Descuento vs precio justo {formatPct(listing.discountPct)}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
