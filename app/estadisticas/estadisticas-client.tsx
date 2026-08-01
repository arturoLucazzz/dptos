"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsBundle } from "@/lib/analytics";

function formatPerM2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `S/ ${Math.round(value).toLocaleString("es-PE")}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function IndexChart({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: AnalyticsBundle["saleIndex"];
}) {
  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Todavía no hay historia suficiente. El índice de salidas aparece cuando hay
          avisos posiblemente vendidos (varias corridas).
        </CardContent>
      </Card>
    );
  }

  const data = points.map((p) => ({
    week: p.week.slice(5),
    vivos: p.livePerM2 != null ? Math.round(p.livePerM2) : null,
    salidas: p.exitedPerM2 != null ? Math.round(p.exitedPerM2) : null,
    liveN: p.liveN,
    exitedN: p.exitedN,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            />
            <Tooltip
              formatter={(value, name) => [
                typeof value === "number" ? `S/ ${value.toLocaleString("es-PE")}/m²` : "—",
                name === "vivos" ? "Vivos" : "Salidas",
              ]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="vivos"
              name="Vivos"
              stroke="#d97706"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="salidas"
              name="Salidas"
              stroke="#0f766e"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function EstadisticasClient({ data }: { data: AnalyticsBundle }) {
  const inventoryChart = data.inventory.map((d) => ({
    name: d.districtName,
    venta: d.saleProperties,
    alquiler: d.rentProperties,
  }));

  const constructionChart = data.construction.map((d) => ({
    name: d.districtName,
    planos: d.enPlanos,
    construccion: d.enConstruccion,
    inmediata: d.entregaInmediata,
    units: d.unitsApprox,
  }));

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Evolución de precios</h2>
          <p className="text-sm text-muted-foreground">
            Mediana S//m². La serie de salidas usa el último precio de avisos que
            desaparecieron — sin eso, lo barato se vende y el promedio de vivos sube
            solo por sesgo de supervivencia.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <IndexChart
            title="Venta"
            subtitle="Vivos vs. posiblemente vendidos"
            points={data.saleIndex}
          />
          <IndexChart
            title="Alquiler"
            subtitle="Vivos vs. que dejaron de publicarse"
            points={data.rentIndex}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Inventario por distrito</h2>
          <p className="text-sm text-muted-foreground">
            Contado por departamento físico, no por aviso. Tres corredores en el mismo
            flat cuentan como uno. La dispersión alta sugiere más mal precificados.
          </p>
        </div>

        {inventoryChart.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Propiedades en venta y alquiler</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inventoryChart} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="venta" name="Venta" fill="#d97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="alquiler" name="Alquiler" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Distrito</th>
                <th className="px-3 py-2 font-medium">Venta</th>
                <th className="px-3 py-2 font-medium">Alquiler</th>
                <th className="px-3 py-2 font-medium">Venta/Alq.</th>
                <th className="px-3 py-2 font-medium">Mediana S//m²</th>
                <th className="px-3 py-2 font-medium">p25–p75</th>
                <th className="px-3 py-2 font-medium">Dispersión</th>
                <th className="px-3 py-2 font-medium">n</th>
              </tr>
            </thead>
            <tbody>
              {data.inventory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Sin inventario vivo todavía.
                  </td>
                </tr>
              ) : (
                data.inventory.map((d) => (
                  <tr key={d.districtSlug} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{d.districtName}</td>
                    <td className="px-3 py-2">{d.saleProperties}</td>
                    <td className="px-3 py-2">{d.rentProperties}</td>
                    <td className="px-3 py-2">
                      {d.saleToRent != null ? d.saleToRent.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2">{formatPerM2(d.saleMedianPerM2)}</td>
                    <td className="px-3 py-2">
                      {d.saleP25PerM2 != null && d.saleP75PerM2 != null
                        ? `${Math.round(d.saleP25PerM2).toLocaleString("es-PE")}–${Math.round(d.saleP75PerM2).toLocaleString("es-PE")}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          d.saleDispersion != null && d.saleDispersion > 0.35
                            ? "text-amber-700"
                            : undefined
                        }
                        title="(p75 − p25) / mediana. Alta = más oportunidad o más ruido."
                      >
                        {formatPct(d.saleDispersion)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.saleN}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Pipeline de construcción</h2>
          <p className="text-sm text-muted-foreground">
            Proyectos, no candidatos de compra. Son un indicador adelantado de presión
            sobre los alquileres futuros en ese distrito.
          </p>
        </div>

        {constructionChart.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No hay proyectos vivos en la base. Aparecen cuando el scrape incluye kind
              PROJECT (la corrida semanal los trae).
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Proyectos por etapa</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={constructionChart}
                    margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="planos" name="En planos" stackId="a" fill="#fde68a" />
                    <Bar dataKey="construccion" name="En construcción" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="inmediata" name="Entrega inmediata" stackId="a" fill="#b45309" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Distrito</th>
                    <th className="px-3 py-2 font-medium">En planos</th>
                    <th className="px-3 py-2 font-medium">En construcción</th>
                    <th className="px-3 py-2 font-medium">Entrega inmediata</th>
                    <th className="px-3 py-2 font-medium">Proyectos</th>
                    <th className="px-3 py-2 font-medium">Unidades ≈</th>
                  </tr>
                </thead>
                <tbody>
                  {data.construction.map((d) => (
                    <tr key={d.districtSlug} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{d.districtName}</td>
                      <td className="px-3 py-2">{d.enPlanos}</td>
                      <td className="px-3 py-2">{d.enConstruccion}</td>
                      <td className="px-3 py-2">{d.entregaInmediata}</td>
                      <td className="px-3 py-2">{d.total}</td>
                      <td className="px-3 py-2">{d.unitsApprox}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
