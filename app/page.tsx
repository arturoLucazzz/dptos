import { cookies } from "next/headers";
import {
  ASSUMPTIONS_COOKIE,
  parseAssumptionsCookie,
} from "@/lib/assumptions-cookie";
import { homeKpis } from "@/lib/home";
import { RECO_FIRST } from "@/lib/home-rows";
import { loadHomeFilters } from "@/lib/home-filters";
import { filterHomeRows, homeDistrictOptions, loadHomeRows, recommendHome } from "@/lib/home-universe";
import { SOURCE_IDS } from "@/lib/listing-card";
import { pickImageLookup } from "@/lib/investments/workspace-data";
import { listInvestments } from "@/lib/investments/store";
import { loadRentObservations } from "@/lib/market";
import { ContinueCard } from "./inicio/continue-card";
import { InicioInversionProvider } from "./inicio/inicio-inversion";
import { KpiStrip } from "./inicio/kpi-strip";
import { Recommendations } from "./inicio/recommendations";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await cookies()).get(ASSUMPTIONS_COOKIE)?.value;
  const rows = await loadHomeRows(parseAssumptionsCookie(raw));
  const filters = loadHomeFilters(await searchParams);
  const districtOptions = homeDistrictOptions(rows);
  const present = new Set(rows.flatMap((r) => r.copies.map((c) => c.source)));
  const sourceOptions = SOURCE_IDS.filter((s) => present.has(s));

  const districts = new Set(rows.map((r) => r.districtSlug));
  const rents = (await loadRentObservations())
    .filter((o) => districts.has(o.districtSlug))
    .map((o) => o.pricePen);
  const kpis = homeKpis(rows, rents);
  // Newest first: the first is the one to continue, the next four are the others.
  const investments = await listInvestments();
  const last = investments[0];
  const imageOf = last
    ? await pickImageLookup(last.items.some((i) => i.projectId))
    : null;
  const initial = last
    ? {
        id: last.id,
        name: last.name,
        items: last.items.map((i) => ({
          id: i.id,
          propertyId: i.propertyId,
          projectId: i.projectId,
          imageUrl: imageOf?.(i) ?? null,
        })),
      }
    : null;
  const others = investments
    .slice(1, 5)
    .map((i) => ({ id: i.id, name: i.name, count: i.items.length }));

  return (
    <InicioInversionProvider initial={initial} others={others}>
      <div className="space-y-6">
        <KpiStrip kpis={kpis} />
        <ContinueCard />
        {/* The key restarts the list when the assumptions change, so it never shows old numbers. */}
        <Recommendations
          key={raw ?? ""}
          initial={recommendHome(filterHomeRows(rows, filters), filters.orden, RECO_FIRST)}
          districtOptions={districtOptions}
          sourceOptions={sourceOptions}
        />
      </div>
    </InicioInversionProvider>
  );
}
