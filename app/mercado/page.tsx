import type { ReactNode } from "react";
import { constructionRows, rentVsSaleRows, yieldRows } from "@/lib/market-chart-rows";
import { loadMarketDashboard } from "@/lib/market-dashboard";
import { loadDistrictMap } from "@/lib/district-map-load";
import { KpiStrip } from "../inicio/kpi-strip";
import { ChartCard, ConstructionChart, HistogramChart, RentVsSaleChart, YieldChart } from "./market-charts";
import { DistrictMap } from "./district-map";
import { NseBars } from "./nse-bars";
import { SourcesTable } from "./sources-table";

export const dynamic = "force-dynamic";

/** A page section: a title, a one-line explanation, and its content. Later tasks add more of these. */
function Section({ title, explain, children }: { title: string; explain: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{explain}</p>
      </div>
      {children}
    </section>
  );
}

export default async function MercadoPage() {
  const m = await loadMarketDashboard();
  const map = await loadDistrictMap(m.districts.map((d) => d.slug));
  const SRC = "Avisos de Urbania, Adondevivir, Proper y Nexo en las últimas corridas.";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Mercado</h1>
        <p className="text-sm text-muted-foreground">Cómo están los precios y los alquileres en los distritos que sigue dptos.</p>
      </div>

      <Section title="Los números del mercado" explain="Cifras típicas de todos los avisos vigentes.">
        <KpiStrip kpis={m.kpis} />
      </Section>

      <Section title="Por distrito" explain="Compara los distritos que tienen suficientes avisos.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Alquiler mensual vs precio de venta"
            explain="Barras: precio de venta típico. Línea: alquiler mensual típico. Distritos con 20 o más avisos en venta."
            source={`Mediana de los avisos de venta y de alquiler por distrito. ${SRC}`}
          >
            <RentVsSaleChart rows={rentVsSaleRows(m.districts)} />
          </ChartCard>
          <ChartCard
            title="Rentabilidad bruta por distrito"
            explain="Alquiler de un año entre el precio de venta. En verde, los tres distritos con más rentabilidad."
            source={`Mediana por distrito del alquiler anual estimado entre el precio de venta. Solo cuentan distritos con 20 o más ventas para el top 3. ${SRC}`}
          >
            <YieldChart rows={yieldRows(m.districts, m.topYield)} />
          </ChartCard>
          <ChartCard
            title="Dónde se construye"
            explain="Proyectos por etapa en cada distrito."
            source="Proyectos con avisos vigentes en Urbania, según la etapa que publica el proyecto."
          >
            <ConstructionChart rows={constructionRows(m.construction)} />
          </ChartCard>
          <ChartCard
            title="Cuántos avisos por precio"
            explain="Avisos en venta por tramo de S/ 100 mil."
            source={`Conteo de avisos de venta vigentes por precio. ${SRC}`}
          >
            <HistogramChart bins={m.histogram} />
          </ChartCard>
        </div>
      </Section>

      <Section title="Cómo se reparte Lima" explain="Los 43 distritos pintados por un dato a la vez, y los niveles socioeconómicos de la ciudad.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <DistrictMap districts={map.features} metrics={map.metrics} />
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Niveles socioeconómicos de Lima Metropolitana</h3>
            <NseBars nse={map.nse} source={map.nseSource ? `${map.nseSource.source}, ${map.nseSource.period}` : "fuente sin cargar"} />
          </div>
        </div>
      </Section>

      <Section title="Nuestras fuentes" explain="Qué aporta cada portal y cuánto se movió en la última semana.">
        <div className="rounded-xl border border-border bg-card p-4">
          <SourcesTable sources={m.sources} repeated={m.repeated} />
        </div>
      </Section>
    </div>
  );
}
