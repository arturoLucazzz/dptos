"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatPenOrNoData,
  type ConstructionRow,
  type RentVsSaleRow,
  type YieldRow,
} from "@/lib/market-chart-rows";

/** Own legend: Recharts writes an English "legend icon" label on each swatch. */
function ChartLegend({ payload }: { payload?: readonly { value?: unknown; color?: string }[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(payload ?? []).map((p) => (
        <li key={String(p.value)} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
          {String(p.value)}
        </li>
      ))}
    </ul>
  );
}

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const GRID = "var(--border)";
const SURFACE = "var(--card)";

const pct = (n: number | null) => (n == null ? "sin datos" : `${n.toLocaleString("es-PE")} %`);
const compactPen = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("es-PE")} M` : `${Math.round(n / 1000)} mil`);

/** A card with a title, a one-line explanation, and a hover note that gives the source and period. */
export function ChartCard({ title, explain, source, children }: { title: string; explain: string; source: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`Fuente de ${title}`} className="text-muted-foreground hover:text-foreground">
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{source}</TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{explain}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TipBox({ title, lines }: { title: string; lines: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {lines.map((l) => (
        <p key={l.label} className="flex items-center gap-2 text-muted-foreground">
          {l.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: l.color }} />}
          <span>{l.label}:</span>
          <span className="text-foreground">{l.value}</span>
        </p>
      ))}
    </div>
  );
}

type TipProps<T> = { active?: boolean; payload?: readonly { payload: T }[] };

export function RentVsSaleChart({ rows }: { rows: RentVsSaleRow[] }) {
  return (
    <div role="img" aria-label="Gráfico de barras y línea: precio de venta típico y alquiler mensual típico por distrito." className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={-30} textAnchor="end" height={60} />
          <YAxis yAxisId="sale" tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={compactPen} />
          <YAxis yAxisId="rent" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => v.toLocaleString("es-PE")} />
          <ChartTooltip
            cursor={{ fill: "var(--accent)" }}
            content={({ active, payload }: TipProps<RentVsSaleRow>) => {
              const r = active ? payload?.[0]?.payload : undefined;
              if (!r) return null;
              return (
                <TipBox
                  title={r.name}
                  lines={[
                    { label: "Precio de venta típico", value: formatPenOrNoData(r.sale), color: "var(--chart-1)" },
                    { label: "Avisos en venta", value: String(r.saleCount) },
                    { label: "Alquiler mensual típico", value: formatPenOrNoData(r.rent), color: "var(--chart-4)" },
                    { label: "Avisos de alquiler", value: String(r.rentCount) },
                  ]}
                />
              );
            }}
          />
          <Legend verticalAlign="top" height={24} content={<ChartLegend />} />
          <Bar yAxisId="sale" dataKey="sale" name="Precio de venta (S/, eje izquierdo)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line yAxisId="rent" dataKey="rent" name="Alquiler mensual (S/, eje derecho)" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 4, fill: "var(--chart-4)", stroke: SURFACE, strokeWidth: 2 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function YieldChart({ rows }: { rows: YieldRow[] }) {
  const data = rows.map((r) => ({ ...r, bar: r.yieldPct ?? 0, axisLabel: r.yieldPct == null ? `${r.name} (sin datos)` : r.name }));
  return (
    <div role="img" aria-label="Gráfico de barras horizontales: rentabilidad bruta por distrito, con los tres más altos resaltados." style={{ height: Math.max(220, rows.length * 28 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v} %`} />
          <YAxis
            type="category"
            dataKey="axisLabel"
            width={130}
            tickLine={false}
            axisLine={false}
            tick={AXIS}
          />
          <ChartTooltip
            cursor={{ fill: "var(--accent)" }}
            content={({ active, payload }: TipProps<YieldRow>) => {
              const r = active ? payload?.[0]?.payload : undefined;
              if (!r) return null;
              return <TipBox title={r.name} lines={[{ label: "Rentabilidad bruta", value: pct(r.yieldPct) }, ...(r.top ? [{ label: "Entre las 3 más altas", value: "sí" }] : [])]} />;
            }}
          />
          <Bar dataKey="bar" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((r) => (
              <Cell key={r.slug} fill={r.top ? "var(--gain)" : "var(--muted-foreground)"} fillOpacity={r.top ? 1 : 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const STAGES = [
  { key: "enPlanos", label: "En planos", color: "var(--chart-4)" },
  { key: "enConstruccion", label: "En construcción", color: "var(--chart-1)" },
  { key: "entregaInmediata", label: "Entrega inmediata", color: "var(--muted-foreground)" },
] as const;

export function ConstructionChart({ rows }: { rows: ConstructionRow[] }) {
  return (
    <div role="img" aria-label="Gráfico de barras apiladas: proyectos por etapa (en planos, en construcción, entrega inmediata) en cada distrito." className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={-30} textAnchor="end" height={60} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: "var(--accent)" }}
            content={({ active, payload }: TipProps<ConstructionRow>) => {
              const r = active ? payload?.[0]?.payload : undefined;
              if (!r) return null;
              return <TipBox title={r.name} lines={STAGES.map((s) => ({ label: s.label, value: `${r[s.key]} proyectos`, color: s.color }))} />;
            }}
          />
          <Legend verticalAlign="top" height={24} content={<ChartLegend />} />
          {STAGES.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="stage" fill={s.color} stroke={SURFACE} strokeWidth={2} maxBarSize={32} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type Bin = { label: string; from: number; to: number | null; count: number };

export function HistogramChart({ bins }: { bins: Bin[] }) {
  return (
    <div role="img" aria-label="Histograma: cantidad de avisos en venta por tramo de precio de S/ 100 mil." className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={4} tickFormatter={(l: string) => (l.includes("o más") ? "2 M+" : l.startsWith("S/ 0–") ? "0" : l.includes("mil") ? `${l.split("–")[0].replace("S/ ", "")} mil` : l.split("–")[0].replace("S/ ", "") + " M")} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: "var(--accent)" }}
            content={({ active, payload }: TipProps<Bin>) => {
              const b = active ? payload?.[0]?.payload : undefined;
              if (!b) return null;
              return <TipBox title={b.label} lines={[{ label: "Avisos en venta", value: b.count.toLocaleString("es-PE") }]} />;
            }}
          />
          <Bar dataKey="count" name="Avisos" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
