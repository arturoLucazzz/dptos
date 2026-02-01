import { getUrbaniaData } from "@/app/lib/get-data";
import { FavoritosClient } from "./favoritos-client";

export default async function FavoritosPage() {
  const data = await getUrbaniaData();

  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Favoritos</h1>
        <p className="mt-4 text-muted-foreground">
          No hay datos. Ejecuta <code className="rounded bg-muted px-1.5 py-0.5">pnpm scrape</code> primero.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Favoritos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tus departamentos guardados
      </p>
      <div className="mt-6">
        <FavoritosClient apartments={data.apartments} />
      </div>
    </div>
  );
}
