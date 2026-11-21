import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { FavoritesProvider } from "@/app/providers";
import { DepartamentosUnifiedClient } from "./departamentos-unified-client";

export const dynamic = "force-dynamic";

export default async function DepartamentosPage() {
  // The favorite column on this page is the only user of the favorites context.
  let favoriteIds: string[] = [];
  try {
    const favorites = await prisma.property.findMany({ where: { favorite: true }, select: { id: true } });
    favoriteIds = favorites.map((f) => f.id);
  } catch {
    // Fresh checkout with no DB yet: the page still renders.
  }
  return (
    <FavoritesProvider initialFavoriteIds={favoriteIds}>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <DepartamentosUnifiedClient />
      </Suspense>
    </FavoritesProvider>
  );
}
