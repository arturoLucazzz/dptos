import { loadSaleListings } from "@/lib/listings";
import { AssumptionsShell } from "@/components/assumptions-panel";
import { DepartamentosUnifiedClient } from "./departamentos-unified-client";

export const dynamic = "force-dynamic";

export default async function DepartamentosPage() {
  let page;
  try {
    page = await loadSaleListings();
  } catch (error) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Departamentos</h1>
        <p className="mt-4 text-muted-foreground">
          No se pudo leer la base. ¿Corriste{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">pnpm db:migrate</code> y{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">pnpm scrape</code>?
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  if (page.listings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Departamentos</h1>
        <p className="mt-4 text-muted-foreground">
          No hay avisos de venta. Ejecuta{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">pnpm scrape</code> o{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">pnpm replay</code>.
        </p>
      </div>
    );
  }

  return (
    <AssumptionsShell>
      <h1 className="text-2xl font-semibold">Departamentos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {page.listings.length.toLocaleString("es-PE")} avisos
        {page.scrapedAt
          ? ` · actualizado ${new Date(page.scrapedAt).toLocaleString("es-PE")}`
          : ""}
      </p>
      <div className="mt-6">
        <DepartamentosUnifiedClient
          listings={page.listings}
          districtOptions={page.districtOptions}
          fixedAssumptions={page.fixedAssumptions}
        />
      </div>
    </AssumptionsShell>
  );
}
