import { cookies } from "next/headers";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";
import { queryDepartamentos } from "@/lib/departamentos-query";
import { homeKpis } from "@/lib/home";
import { toHomeRow } from "@/lib/home-rows";
import { getCachedSaleListings } from "@/lib/listings";
import { loadRentObservations } from "@/lib/market";
import { ContinueCard } from "./inicio/continue-card";
import { KpiStrip } from "./inicio/kpi-strip";
import { Recommendations } from "./inicio/recommendations";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const panel = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);
  const universe = await getCachedSaleListings();
  // Computed per request: the full row set is too big for the Next.js data cache.
  const { rows } = queryDepartamentos(universe.listings, universe.fixedAssumptions, {
    districts: [],
    sources: [],
    priceMin: null,
    priceMax: null,
    bedroomsMin: null,
    bedroomsMax: null,
    coverageMin: null,
    panel,
    sort: "monthlyGain",
    order: "desc",
    page: 1,
    pageSize: 100000,
  });

  const districts = new Set(rows.map((r) => r.districtSlug));
  const rents = (await loadRentObservations())
    .filter((o) => districts.has(o.districtSlug))
    .map((o) => o.pricePen);
  const kpis = homeKpis(rows, rents);
  const thumbs = rows
    .filter((r) => r.favorite && r.propertyId)
    .slice(0, 5)
    .map((r) => ({ id: r.propertyId as string, imageUrl: r.imageUrl }));

  return (
    <div className="space-y-6">
      <KpiStrip kpis={kpis} />
      <ContinueCard thumbs={thumbs} />
      <Recommendations rows={rows.map(toHomeRow)} />
    </div>
  );
}
