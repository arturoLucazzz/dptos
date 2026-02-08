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
  PieChart,
  Pie,
  Cell,
  Legend,
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
    for (const a of withPrice) {
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
        areaPromedio: v.areas.length ? Math.round(v.areas.reduce((s, x) => s + x, 0) / v.areas.length) : 0,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [withPrice]);

  const byDistrictWithArea = useMemo(() => {
    const map = new Map<string, { areas: number[]; prices: number[] }>();
    for (const a of withPrice) {
      const key = a.limaDistrictName ?? a.limaDistrictSlug ?? "Otro";
      if (!map.has(key)) map.set(key, { areas: [], prices: [] });
      const v = map.get(key)!;
      if (a.area != null) v.areas.push(a.area);
      if (a.price != null) v.prices.push(a.price);
    }
    return Array.from(map.entries()).map(([name, v]) => ({
      name,
      areaPromedio: v.areas.length ? Math.round(v.areas.reduce((s, x) => s + x, 0) / v.areas.length) : 0,
      precioPromedio: v.prices.length ? Math.round(v.prices.reduce((s, x) => s + x, 0) / v.prices.length) : 0,
    }));
  }, [withPrice]);

  const byStage = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of withPrice) {
      const key = a.developmentStage ?? "Sin etapa";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [withPrice]);

  const byPropertyType = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of withPrice) {
      const key = a.propertyType ?? "Otro";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [withPrice]);

  const byBedrooms = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of withPrice) {
      const k = a.bedrooms ?? 0;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, cantidad]) => ({ name: name === 0 ? "Sin dato" : `${name}`, cantidad }))
      .sort((a, b) => (a.name === "Sin dato" ? 1 : Number(a.name) - Number(b.name)));
  }, [withPrice]);

  const priceRanges = useMemo(() => {
    const prices = withPrice.map((a) => a.price!).sort((a, b) => a - b);
    if (prices.length === 0) return [];
    const min = prices[0];
    const max = prices[prices.length - 1];
    const step = Math.ceil((max - min) / 10) || 1;
    const buckets: { rango: string; cantidad: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const low = min + i * step;
      const high = i === 9 ? max + 1 : min + (i + 1) * step;
      const count = prices.filter((p) => p >= low && p < high).length;
      buckets.push({ rango: `${(low / 1000).toFixed(0)}k-${(high / 1000).toFixed(0)}k`, cantidad: count });
    }
    return buckets;
  }, [withPrice]);

  const totals = useMemo(() => {
    const prices = withPrice.map((a) => a.price!);
    const areas = withPrice.map((a) => a.area!).filter(Boolean);
    return {
      total: withPrice.length,
      precioMin: prices.length ? Math.min(...prices) : 0,
      precioMax: prices.length ? Math.max(...prices) : 0,
      precioPromedio: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      precioMediano: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
      areaPromedio: areas.length ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length) : 0,
      precioPorM2: withPrice
        .filter((a) => a.price != null && a.area != null && a.area > 0)
        .map((a) => a.price! / a.area!)
        .reduce((a, b, _, arr) => (arr.length ? a + b / arr.length : 0), 0),
    };
  }, [withPrice]);

  const topDistricts = useMemo(() => byDistrict.slice(0, 5), [byDistrict]);
  const precioPorM2PorDistrito = useMemo(() => {
    return byDistrictWithArea
      .map((d) => {
        const list = withPrice.filter(
          (a) => (a.limaDistrictName ?? a.limaDistrictSlug) === d.name && a.price != null && a.area != null && a.area > 0
        );
        const avg = list.length ? list.reduce((s, a) => s + a.price! / a.area!, 0) / list.length : 0;
        return { name: d.name, "Precio/m²": Math.round(avg) };
      })
      .filter((d) => d["Precio/m²"] > 0);
  }, [withPrice, byDistrictWithArea]);

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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inmuebles por distrito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDistrict} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => v.toLocaleString("es-PE")} />
                  <Bar dataKey="cantidad" fill={CHART_COLORS[0]} name="Cantidad" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Precio promedio por distrito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDistrict} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `S/ ${v.toLocaleString("es-PE")}`} />
                  <Bar dataKey="precioPromedio" fill={CHART_COLORS[1]} name="Precio promedio" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Precio min y max por distrito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDistrict} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `S/ ${v.toLocaleString("es-PE")}`} />
                  <Bar dataKey="precioMin" fill={CHART_COLORS[2]} name="Mínimo" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="precioMax" fill={CHART_COLORS[3]} name="Máximo" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por etapa de desarrollo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byStage}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {byStage.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v.toLocaleString("es-PE"), "Cantidad"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipo de propiedad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byPropertyType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {byPropertyType.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[(i + 1) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v.toLocaleString("es-PE"), "Cantidad"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución de precios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priceRanges} margin={{ top: 5, right: 5, left: 5, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="rango" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="cantidad" fill={CHART_COLORS[4]} name="Cantidad" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dormitorios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byBedrooms} margin={{ top: 5, right: 5, left: 5, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="cantidad" fill={CHART_COLORS[5]} name="Cantidad" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Área promedio por distrito (m²)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDistrict.filter((d) => d.areaPromedio > 0)} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v} m²`, "Área promedio"]} />
                  <Bar dataKey="areaPromedio" fill={CHART_COLORS[7]} name="Área prom. (m²)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Precio por m² por distrito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={precioPorM2PorDistrito} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`S/ ${v.toLocaleString("es-PE")}`, "Precio/m²"]} />
                  <Bar dataKey="Precio/m²" fill={CHART_COLORS[6]} name="Precio/m²" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 distritos por cantidad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDistricts} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="cantidad" fill={CHART_COLORS[0]} name="Cantidad" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen numérico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Precio mediano:</span> S/ {totals.precioMediano.toLocaleString("es-PE")}</p>
            <p><span className="text-muted-foreground">Área promedio:</span> {totals.areaPromedio} m²</p>
            <p><span className="text-muted-foreground">Precio/m² promedio:</span> S/ {Math.round(totals.precioPorM2).toLocaleString("es-PE")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
