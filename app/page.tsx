import { cookies } from "next/headers";
import {
  ASSUMPTIONS_COOKIE,
  parseAssumptionsCookie,
} from "@/lib/assumptions-cookie";
import { homeKpis } from "@/lib/home";
import { RECO_FIRST } from "@/lib/home-rows";
import { loadHomeRows, recommendHome } from "@/lib/home-universe";
import { pickImageLookup } from "@/lib/investments/workspace-data";
import { listInvestments } from "@/lib/investments/store";
import { loadRentObservations } from "@/lib/market";
import { ContinueCard } from "./inicio/continue-card";
import { InicioInversionProvider } from "./inicio/inicio-inversion";
import { KpiStrip } from "./inicio/kpi-strip";
import { Recommendations } from "./inicio/recommendations";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const raw = (await cookies()).get(ASSUMPTIONS_COOKIE)?.value;
  const rows = await loadHomeRows(parseAssumptionsCookie(raw));

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
          initial={recommendHome(rows, "gain", RECO_FIRST)}
        />
      </div>
    </InicioInversionProvider>
  );
}
