import Link from "next/link";
import { cookies } from "next/headers";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";
import { parseInvestmentFilters } from "@/lib/investments/filters";
import { getInvestment, touchInvestment } from "@/lib/investments/store";
import { loadCards, loadDistrictOptions, loadPickViews, loadZoneOutlines } from "@/lib/investments/workspace-data";
import { Workspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function InversionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investment = await getInvestment(id);
  if (!investment) {
    return (
      <div className="space-y-3 py-12 text-center">
        <p className="text-lg font-semibold">Esta inversión no existe</p>
        <Link href="/inversiones" className="text-sm text-primary hover:underline">
          Ver mis inversiones
        </Link>
      </div>
    );
  }

  const raw = (await cookies()).get(ASSUMPTIONS_COOKIE)?.value;
  const panel = parseAssumptionsCookie(raw);
  const filters = parseInvestmentFilters(investment.filters);
  const [cards, picks, districtOptions, zones] = await Promise.all([
    loadCards(filters, panel, 1),
    loadPickViews(investment.items, panel),
    loadDistrictOptions(),
    loadZoneOutlines(),
    touchInvestment(id),
  ]);

  return (
    // A new key per server render: a settings change or a refresh after Back remounts the
    // workspace with fresh numbers and picks instead of keeping the old state.
    <Workspace
      key={crypto.randomUUID()}
      investment={{
        id: investment.id,
        name: investment.name,
        items: investment.items.map((i) => ({ id: i.id, propertyId: i.propertyId, projectId: i.projectId })),
      }}
      initialFilters={filters}
      initialCards={cards}
      initialPicks={picks}
      districtOptions={districtOptions}
      zones={zones}
    />
  );
}
