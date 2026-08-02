import { getCachedSaleListings } from "@/lib/listings";
import { FavoritosClient } from "./favoritos-client";

export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const page = await getCachedSaleListings();
  const favorites = page.listings.filter((l) => l.favorite);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Favoritos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Guardados en el departamento físico, no en el aviso: un repost no te los borra.
      </p>
      <div className="mt-6">
        <FavoritosClient
          listings={favorites}
          fixedAssumptions={page.fixedAssumptions}
        />
      </div>
    </div>
  );
}
