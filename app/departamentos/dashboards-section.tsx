"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DepartamentosStats } from "@/lib/departamentos-query";
import { formatPen, formatPct } from "@/lib/listing-finance";

interface DashboardsSectionProps {
  stats: DepartamentosStats | null;
  isValidating?: boolean;
}

export function DashboardsSection({ stats, isValidating }: DashboardsSectionProps) {
  const totals = stats ?? {
    total: 0,
    withRent: 0,
    coverageMedian: null,
    aporteMedian: null,
    above40: 0,
    precioMediano: null,
  };

  return (
    <div
      className={`grid gap-4 md:grid-cols-2 lg:grid-cols-4 ${isValidating ? "opacity-70" : ""}`}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Avisos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totals.total.toLocaleString("es-PE")}</p>
          <p className="text-xs text-muted-foreground">
            {totals.withRent} con alquiler estimado
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            % cobertura mediana
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatPct(totals.coverageMedian)}</p>
          <p className="text-xs text-muted-foreground">con la hipoteca actual</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            De bolsillo mediano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatPen(totals.aporteMedian)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            % cobertura ≥ 40%
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totals.above40.toLocaleString("es-PE")}</p>
          <p className="text-xs text-muted-foreground">
            precio mediano {formatPen(totals.precioMediano)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
