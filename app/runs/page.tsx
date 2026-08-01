import { prisma } from "@/lib/db";
import { ScrapeStatus } from "@/lib/generated/prisma/enums";
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
      skippedDistricts: true,
      errors: true,
      notes: true,
    },
  });

  const serialized = runs.map((run) => {
    const counts = (run.districtCounts ?? {}) as Record<string, Partial<Record<"SALE" | "RENT", number>>>;
    let sale = 0;
    let rent = 0;
    const districts: { slug: string; sale: number; rent: number }[] = [];
    for (const [slug, byOp] of Object.entries(counts)) {
      const s = byOp.SALE ?? 0;
      const r = byOp.RENT ?? 0;
      sale += s;
      rent += r;
      districts.push({ slug, sale: s, rent: r });
    }
    districts.sort((a, b) => a.slug.localeCompare(b.slug));

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
      districts,
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
