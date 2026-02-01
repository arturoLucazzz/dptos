import { getUrbaniaData } from "@/app/lib/get-data";
import { EstadisticasClient } from "./estadisticas-client";

export default async function EstadisticasPage() {
  const data = await getUrbaniaData();

  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Estadísticas</h1>
        <p className="mt-4 text-muted-foreground">
          No hay datos. Ejecuta <code className="rounded bg-muted px-1.5 py-0.5">pnpm scrape</code> para generar el JSON en <code className="rounded bg-muted px-1.5 py-0.5">data/</code>.
        </p>
      </div>
    );
  }

  const districtOptions = Array.from(
    new Map(
      data.apartments
        .filter((a) => a.limaDistrictSlug && a.limaDistrictName)
        .map((a) => [a.limaDistrictSlug!, { value: a.limaDistrictSlug!, label: a.limaDistrictName! }])
    ).values()
  ).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Estadísticas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Análisis de departamentos en venta · {data.totalResults} resultados
      </p>
      <div className="mt-6">
        <EstadisticasClient apartments={data.apartments} districtOptions={districtOptions} />
      </div>
    </div>
  );
}
