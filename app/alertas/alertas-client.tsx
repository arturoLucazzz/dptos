"use client";

import type { NewCoverageAlert, PriceDropAlert } from "@/lib/alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatPen(value: number): string {
  return `S/ ${Math.round(value).toLocaleString("es-PE")}`;
}

function ListingLink({
  sourcePath,
  children,
}: {
  sourcePath: string | null;
  children: React.ReactNode;
}) {
  if (!sourcePath) return <span>{children}</span>;
  return (
    <a
      href={`https://urbania.pe${sourcePath}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-foreground underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

export function AlertasClient({
  priceDrops,
  newHighCoverage,
}: {
  priceDrops: PriceDropAlert[];
  newHighCoverage: NewCoverageAlert[];
}) {
  const empty = priceDrops.length === 0 && newHighCoverage.length === 0;

  return (
    <div className="space-y-8">
      {empty && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          Nada nuevo en las últimas 24 horas. Las alertas aparecen después de una
          corrida que vea bajadas de precio o avisos nuevos con cobertura alta.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">Bajadas de precio</h2>
          <span className="text-sm text-muted-foreground">{priceDrops.length}</span>
        </div>
        {priceDrops.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna en la ventana.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {priceDrops.map((alert) => (
              <Card key={`${alert.postingId}-${alert.observedAt}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium leading-tight">
                    <ListingLink sourcePath={alert.sourcePath}>
                      {alert.title ?? alert.address ?? alert.sourcePostingId}
                    </ListingLink>
                  </CardTitle>
                  <Badge className="bg-emerald-100 text-emerald-800 shrink-0">
                    −{alert.dropPct.toFixed(1)}%
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>{alert.districtName}</p>
                  <p>
                    <span className="line-through">{formatPen(alert.previousPen)}</span>
                    {" → "}
                    <span className="font-medium text-foreground">
                      {formatPen(alert.currentPen)}
                    </span>
                  </p>
                  <p className="text-xs">
                    {new Date(alert.observedAt).toLocaleString("es-PE")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">Nuevos con cobertura alta</h2>
          <span className="text-sm text-muted-foreground">{newHighCoverage.length}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Cobertura con los supuestos por defecto (10% inicial, TCEA 9%, 20 años), no
          con el panel — así la alerta no se mueve cuando cambias un slider.
        </p>
        {newHighCoverage.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguno nuevo en el top 5%. Hace falta muestra de alquileres para calcular
            cobertura.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {newHighCoverage.map((alert) => (
              <Card key={alert.postingId}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium leading-tight">
                    <ListingLink sourcePath={alert.sourcePath}>
                      {alert.title ?? alert.address ?? alert.sourcePostingId}
                    </ListingLink>
                  </CardTitle>
                  <Badge className="bg-amber-100 text-amber-900 shrink-0">
                    {alert.coveragePct.toFixed(0)}%
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>{alert.districtName}</p>
                  <p className="font-medium text-foreground">{formatPen(alert.pricePen)}</p>
                  {alert.discountPct != null && (
                    <p className="text-xs">
                      Descuento vs precio justo {alert.discountPct.toFixed(1)}%
                    </p>
                  )}
                  <p className="text-xs">
                    Primero visto {new Date(alert.firstSeenAt).toLocaleString("es-PE")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
