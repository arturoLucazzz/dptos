"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FixedAssumptions, PanelAssumptions } from "@/lib/assumption-defaults";
import type { ListingRow } from "@/lib/listing-row";
import { financeForListing, formatPen, formatPct } from "@/lib/listing-finance";
import { median } from "@/lib/linalg";

interface DashboardsSectionProps {
  filtered: ListingRow[];
  panel: PanelAssumptions;
  fixedAssumptions: FixedAssumptions;
}

export function DashboardsSection({ filtered, panel, fixedAssumptions }: DashboardsSectionProps) {
  const withFinance = useMemo(
    () =>
      filtered
        .map((listing) => ({ listing, finance: financeForListing(listing, panel, fixedAssumptions) }))
        .filter((row): row is { listing: ListingRow; finance: NonNullable<typeof row.finance> } => row.finance != null),
    [filtered, panel, fixedAssumptions]
  );

  const totals = useMemo(() => {
    const coverages = withFinance.map((r) => r.finance.coveragePct);
    const aportes = withFinance.map((r) => r.finance.monthlyContributionPen);
    const prices = filtered.map((r) => r.pricePen);
    const above40 = coverages.filter((c) => c >= 40).length;
    return {
      total: filtered.length,
      withRent: withFinance.length,
      coverageMedian: coverages.length ? median(coverages) : null,
      aporteMedian: aportes.length ? median(aportes) : null,
      above40,
      precioMediano: prices.length ? median(prices) : null,
    };
  }, [filtered, withFinance]);

  const byDistrict = useMemo(() => {
    const map = new Map<
      string,
      { coverages: number[]; aportes: number[]; count: number }
    >();
    for (const { listing, finance } of withFinance) {
      const key = listing.districtName;
      if (!map.has(key)) map.set(key, { coverages: [], aportes: [], count: 0 });
      const v = map.get(key)!;
      v.count++;
      v.coverages.push(finance.coveragePct);
      v.aportes.push(finance.monthlyContributionPen);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        cantidad: v.count,
        coberturaMediana: Math.round(median(v.coverages) * 10) / 10,
        aporteMediano: Math.round(median(v.aportes)),
      }))
      .sort((a, b) => b.coberturaMediana - a.coberturaMediana);
  }, [withFinance]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              Cobertura mediana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatPct(totals.coverageMedian)}</p>
            <p className="text-xs text-muted-foreground">con los supuestos actuales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aporte mediano / mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatPen(totals.aporteMedian)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cobertura ≥ 40%
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

      {byDistrict.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobertura mediana por distrito</CardTitle>
            <p className="text-sm text-muted-foreground">
              El ranking de distritos cambia con la inicial: no es el mismo con 10% que con 40%.
            </p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDistrict} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} unit="%" />
                <Tooltip
                  formatter={(value) =>
                    typeof value === "number" ? [`${value}%`, "Cobertura mediana"] : [String(value), ""]
                  }
                />
                <Bar dataKey="coberturaMediana" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
