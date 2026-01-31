import { getUrbaniaData } from "./lib/get-data";

export default async function HomePage() {
  const data = await getUrbaniaData();

  if (!data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-100">Dptos</h1>
        <p className="mt-4 text-zinc-400">
          No hay datos aún. Ejecuta <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-sm">pnpm scrape</code> para generar el JSON en <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-sm">data/</code>.
        </p>
      </main>
    );
  }

  const sample = data.apartments.slice(0, 3);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-100">Dptos</h1>
      <p className="mt-2 text-sm text-zinc-400">
        {data.totalResults} resultados · Urbania · {new Date(data.scrapedAt).toLocaleDateString("es-PE")}
      </p>
      <ul className="mt-8 space-y-4">
        {sample.map((apt) => (
          <li key={apt.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="font-medium text-zinc-100 line-clamp-2">{apt.title ?? "Sin título"}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {apt.limaDistrictName ?? apt.location} · {apt.priceFormatted ?? "—"}
            </p>
            {(apt.developmentStage ?? apt.deliveryDate) && (
              <p className="mt-1 text-xs text-zinc-500">
                {apt.developmentStage}
                {apt.deliveryDate ? ` · ${apt.deliveryDate}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
