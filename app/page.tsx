import { cookies } from "next/headers";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";
import { homeKpis } from "@/lib/home";
import { RECO_FIRST } from "@/lib/home-rows";
import { loadHomeRows, recommendHome } from "@/lib/home-universe";
import { loadRentObservations } from "@/lib/market";
import { ContinueCard } from "./inicio/continue-card";
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
  const favorites = rows
    .filter((r) => r.favorite && r.propertyId)
    .map((r) => ({ id: r.propertyId as string, imageUrl: r.imageUrl }));

  return (
    <div className="space-y-6">
      <KpiStrip kpis={kpis} />
      <ContinueCard favorites={favorites} />
      {/* The key restarts the list when the assumptions change, so it never shows old numbers. */}
      <Recommendations key={raw ?? ""} initial={recommendHome(rows, "gain", RECO_FIRST)} />
    </div>
  );
}
