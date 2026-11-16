import { prisma } from "@/lib/db";
import { ScrapeStatus } from "@/lib/generated/prisma/enums";
import { SOURCE_IDS, type SourceId } from "@/lib/listing-card";
import { previousCountFrom } from "@/lib/sanity-gate";
import { RunsClient } from "./runs-client";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether the counts are in the per-source shape, which has a source id at the top. */
function isPerSource(counts: unknown): counts is Record<string, unknown> {
  return isRecord(counts) && Object.keys(counts).some((key) => (SOURCE_IDS as readonly string[]).includes(key));
}

function sourceHasCounts(counts: unknown, source: string): boolean {
  if (isPerSource(counts)) return isRecord(counts[source]) && Object.keys(counts[source]).length > 0;
  return source === "urbania" && isRecord(counts) && Object.keys(counts).length > 0;
}

function districtSlugsOf(counts: unknown, source: string): string[] {
  if (isPerSource(counts)) return isRecord(counts[source]) ? Object.keys(counts[source]) : [];
  return source === "urbania" && isRecord(counts) ? Object.keys(counts) : [];
}

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
    // Old runs have no sources and stored flat counts; both mean urbania.
    const recorded = run.sources.length > 0 ? run.sources : ["urbania"];
    const withCounts = SOURCE_IDS.filter(
      (id) => !recorded.includes(id) && sourceHasCounts(run.districtCounts, id)
    );
    const sources = [...recorded, ...withCounts].map((id) => {
      const districts: { slug: string; sale: number; rent: number }[] = [];
      for (const slug of districtSlugsOf(run.districtCounts, id)) {
        const s = previousCountFrom(run.districtCounts, id as SourceId, slug, "SALE");
        const r = previousCountFrom(run.districtCounts, id as SourceId, slug, "RENT");
        if (s == null && r == null) continue;
        districts.push({ slug, sale: s ?? 0, rent: r ?? 0 });
      }
      districts.sort((a, b) => a.slug.localeCompare(b.slug));
      return {
        id,
        recorded: recorded.includes(id),
        sale: districts.reduce((sum, d) => sum + d.sale, 0),
        rent: districts.reduce((sum, d) => sum + d.rent, 0),
        districts,
      };
    });
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
