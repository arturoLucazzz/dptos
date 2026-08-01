import { loadAlerts } from "@/lib/alerts";
import { AlertasClient } from "./alertas-client";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  let bundle;
  try {
    bundle = await loadAlerts();
  } catch (error) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Alertas</h1>
        <p className="mt-4 text-muted-foreground">
          No se pudo leer la base.{" "}
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Alertas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cambios de las últimas 24 horas · desde{" "}
        {new Date(bundle.since).toLocaleString("es-PE")}
        {bundle.coverageThresholdPct != null
          ? ` · cobertura top 5% ≥ ${bundle.coverageThresholdPct.toFixed(0)}%`
          : ""}
      </p>
      <div className="mt-6">
        <AlertasClient
          priceDrops={bundle.priceDrops}
          newHighCoverage={bundle.newHighCoverage}
        />
      </div>
    </div>
  );
}
