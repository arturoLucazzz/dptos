import type { HomeKpis } from "@/lib/home";

const pen = (n: number | null) => (n == null ? "-" : `S/ ${Math.round(n).toLocaleString("es-PE")}`);

export function KpiStrip({ kpis }: { kpis: HomeKpis & { projectCount?: number } }) {
  const items = [
    { label: "Precio de venta típico", value: pen(kpis.typicalSalePen), caption: "Mediana de los avisos en venta de los distritos que sigue dptos" },
    { label: "Alquiler mensual típico", value: pen(kpis.typicalRentPen), caption: "Mediana de los avisos de alquiler de los mismos distritos" },
    { label: "Rentabilidad bruta", value: kpis.grossYieldPct == null ? "-" : `${kpis.grossYieldPct.toLocaleString("es-PE")} %`, caption: "Alquiler de un año dividido entre el precio de venta" },
    { label: "Avisos en venta", value: kpis.saleCount.toLocaleString("es-PE"), caption: "Vistos en las últimas corridas" },
  ];
  if (kpis.projectCount != null) {
    items.push({ label: "Proyectos", value: kpis.projectCount.toLocaleString("es-PE"), caption: "Proyectos con avisos vigentes" });
  }
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${items.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
      {items.map((it) => (
        <div key={it.label} title={`${it.caption}. Fuente: avisos de los portales, últimas corridas.`} className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{it.label}</p>
          <p className="mt-1 text-2xl font-semibold">{it.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{it.caption}</p>
        </div>
      ))}
    </div>
  );
}
