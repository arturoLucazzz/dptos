import { listInvestments } from "@/lib/investments/store";
import { pickImageLookup } from "@/lib/investments/workspace-data";
import { InversionList, type InversionSummary } from "./inversion-list";

export const dynamic = "force-dynamic";

export default async function InversionesPage() {
  const investments = await listInvestments();
  const imageOf = await pickImageLookup(investments.some((inv) => inv.items.some((i) => i.projectId)));
  const summaries: InversionSummary[] = investments.map((inv) => ({
    id: inv.id,
    name: inv.name,
    count: inv.items.length,
    thumbs: inv.items.flatMap((i) => {
      const url = imageOf(i);
      return url ? [url] : [];
    }).slice(0, 4),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mis inversiones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada inversión guarda sus filtros, sus elegidos y tus notas.
        </p>
      </div>
      <InversionList investments={summaries} />
    </div>
  );
}
