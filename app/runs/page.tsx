import { prisma } from "@/lib/db";
import { ScrapeStatus } from "@/lib/generated/prisma/enums";
import { runSourceSections } from "@/lib/run-sources";
import { RunsClient } from "./runs-client";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      mode: true,
      status: true,
      gitSha: true,
      pagesFetched: true,
      districtCounts: true,
      sources: true,
      skippedDistricts: true,
      errors: true,
      notes: true,
    },
  });

  const serialized = runs.map((run) => {
    const sources = runSourceSections(run.districtCounts, run.sources);
    const sale = sources.reduce((sum, src) => sum + src.sale, 0);
    const rent = sources.reduce((sum, src) => sum + src.rent, 0);

    const durationMs =
      run.finishedAt && run.startedAt
        ? run.finishedAt.getTime() - run.startedAt.getTime()
        : null;

    return {
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      mode: run.mode,
      status: run.status as ScrapeStatus,
      gitSha: run.gitSha,
      pagesFetched: run.pagesFetched,
      skippedDistricts: run.skippedDistricts,
      errors: run.errors,
      notes: run.notes,
      sale,
      rent,
      sources,
      durationMs,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Corridas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Salud del scraper. Si un distrito trae 40 avisos en vez de 1,200, se ve aquí.
      </p>
      <div className="mt-6">
        <RunsClient runs={serialized} />
      </div>
    </div>
  );
}
