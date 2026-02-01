import { getUrbaniaData } from "@/app/lib/get-data";
import { DepartamentosTable } from "./departamentos-table";

export default async function DepartamentosPage() {
  const data = await getUrbaniaData();

  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Departamentos</h1>
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
      <h1 className="text-2xl font-semibold">Departamentos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.totalResults} resultados · actualizado {new Date(data.scrapedAt).toLocaleString("es-PE")}
      </p>
      <div className="mt-6">
        <DepartamentosTable data={data.apartments} districtOptions={districtOptions} />
      </div>
    </div>
  );
}
