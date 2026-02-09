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
import type { ApartmentData } from "@/app/lib/types";

const CHART_COLORS = ["#f59e0b", "#d97706", "#b45309", "#fbbf24", "#fcd34d", "#fde68a", "#fef3c7", "#fffbeb"];

interface DashboardsSectionProps {
  filtered: ApartmentData[];
}

export function DashboardsSection({ filtered }: DashboardsSectionProps) {
  const withPrice = filtered.filter((a) => a.price != null);

  const byDistrict = useMemo(() => {
    const map = new Map<string, { count: number; totalPrice: number; prices: number[]; areas: number[] }>();
    for (const a of filtered) {
      const key = a.limaDistrictName ?? a.limaDistrictSlug ?? "Otro";
      if (!map.has(key)) map.set(key, { count: 0, totalPrice: 0, prices: [], areas: [] });
      const v = map.get(key)!;
      v.count++;
      if (a.price != null) {
        v.totalPrice += a.price;
        v.prices.push(a.price);
      }
      if (a.area != null) v.areas.push(a.area);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        cantidad: v.count,
        precioPromedio: v.prices.length ? Math.round(v.totalPrice / v.prices.length) : 0,
        precioMin: v.prices.length ? Math.min(...v.prices) : 0,
        precioMax: v.prices.length ? Math.max(...v.prices) : 0,
      }))
      .sort((a, b) => ("cantidad" in b ? b.cantidad : 0) - ("cantidad" in a ? a.cantidad : 0));
  }, [filtered]);

  const totals = useMemo(() => {
    const prices = withPrice.map((a) => a.price!);
    const areas = withPrice.map((a) => a.area!).filter(Boolean);
    const precioPorM2 = withPrice
      .filter((a) => a.price != null && a.area != null && a.area > 0)
      .map((a) => a.price! / a.area!)
      .reduce((a, b, _, arr) => (arr.length ? a + b / arr.length : 0), 0);
    return {
      total: withPrice.length,
      precioMin: prices.length ? Math.min(...prices) : 0,
      precioMax: prices.length ? Math.max(...prices) : 0,
      precioPromedio: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      precioMediano: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
      areaPromedio: areas.length ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length) : 0,
      precioPorM2: precioPorM2,
    };
  }, [withPrice]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total inmuebles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.total.toLocaleString("es-PE")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Precio mínimo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">S/ {totals.precioMin.toLocaleString("es-PE")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Precio máximo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">S/ {totals.precioMax.toLocaleString("es-PE")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Precio promedio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">S/ {totals.precioPromedio.toLocaleString("es-PE")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Precio promedio por distrito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDistrict} margin={{ top: 5, right: 5, left: 5, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number | undefined) => v ? `S/ ${v.toLocaleString("es-PE")}` : "S/ 0"} />
                  <Bar dataKey="precioPromedio" fill={CHART_COLORS[1]} name="Precio promedio" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
