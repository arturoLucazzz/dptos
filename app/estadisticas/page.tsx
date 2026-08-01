import {
  loadConstructionPipeline,
  loadDistrictInventory,
  loadPriceIndex,
  type AnalyticsBundle,
} from "@/lib/analytics";
import { Operation, ScrapeStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { EstadisticasClient } from "./estadisticas-client";

export const dynamic = "force-dynamic";

export default async function EstadisticasPage() {
  let bundle: AnalyticsBundle;
  try {
    const [saleIndex, rentIndex, inventory, construction, latestRun] = await Promise.all([
      loadPriceIndex(Operation.SALE),
      loadPriceIndex(Operation.RENT),
      loadDistrictInventory(),
      loadConstructionPipeline(),
      prisma.scrapeRun.findFirst({
        where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
        orderBy: { startedAt: "desc" },
        select: { finishedAt: true, startedAt: true },
      }),
    ]);
    bundle = {
      saleIndex,
      rentIndex,
      inventory,
      construction,
      scrapedAt: (latestRun?.finishedAt ?? latestRun?.startedAt)?.toISOString() ?? null,
    };
  } catch (error) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Estadísticas</h1>
        <p className="mt-4 text-muted-foreground">
          No se pudo leer la base.{" "}
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Estadísticas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Precios, inventario y pipeline de construcción
        {bundle.scrapedAt
          ? ` · actualizado ${new Date(bundle.scrapedAt).toLocaleString("es-PE")}`
          : ""}
      </p>
      <div className="mt-6">
        <EstadisticasClient data={bundle} />
      </div>
    </div>
  );
}
