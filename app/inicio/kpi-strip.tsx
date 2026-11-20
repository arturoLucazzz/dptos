import type { HomeKpis } from "@/lib/home";

const pen = (n: number | null) => (n == null ? "-" : `S/ ${Math.round(n).toLocaleString("es-PE")}`);

export function KpiStrip({ kpis }: { kpis: HomeKpis }) {
  const items = [
    { label: "Precio de venta típico", value: pen(kpis.typicalSalePen), caption: "Mediana de los avisos en venta de los distritos que sigue dptos" },
    { label: "Alquiler mensual típico", value: pen(kpis.typicalRentPen), caption: "Mediana de los avisos de alquiler de los mismos distritos" },
    { label: "Rentabilidad bruta", value: kpis.grossYieldPct == null ? "-" : `${kpis.grossYieldPct.toLocaleString("es-PE")} %`, caption: "Alquiler de un año dividido entre el precio de venta" },
    { label: "Avisos en venta", value: kpis.saleCount ? kpis.saleCount.toLocaleString("es-PE") : "-", caption: "Vistos en las últimas corridas" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{it.label}</p>
          <p className="mt-1 text-2xl font-semibold">{it.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{it.caption}</p>
        </div>
      ))}
    </div>
  );
}
