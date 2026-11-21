import Link from "next/link";
import { cookies } from "next/headers";
import { FileSpreadsheet } from "lucide-react";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";
import { buildCompareTable } from "@/lib/investments/compare";
import { getInvestment } from "@/lib/investments/store";
import { loadPickViews } from "@/lib/investments/workspace-data";
import { CompareView } from "./compare-view";

export const dynamic = "force-dynamic";

export default async function CompararPage({ params }: { params: Promise<{ id: string }> }) {
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
  const panel = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);
  const picks = await loadPickViews(investment.items, panel);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/inversiones/${id}`} className="text-xs text-muted-foreground hover:underline">
            ← {investment.name}
          </Link>
          <h1 className="text-xl font-semibold">Comparar</h1>
        </div>
        {picks.length > 0 && (
          <a href={`/inversiones/${id}/excel`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            <FileSpreadsheet className="size-4" /> Exportar a Excel
          </a>
        )}
      </div>
      {picks.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Aún no hay propiedades para comparar. Agrega algunas desde la inversión.</p>
      ) : (
        <CompareView
          columns={picks.map((p) => ({ itemId: p.itemId, title: p.title, districtName: p.districtName, imageUrl: p.imageUrl, note: p.note, url: p.url, gone: p.gone, statusLabel: p.statusLabel }))}
          table={buildCompareTable(picks)}
        />
      )}
    </div>
  );
}
