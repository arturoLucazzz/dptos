import { getCachedSaleListings } from "@/lib/listings";
import { reviewQueue } from "@/lib/duplicate-queue";
import { paginate } from "@/lib/paginate";
import { DuplicateList } from "./duplicate-list";
import type { ReviewRow } from "./duplicate-review";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function DuplicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  const { pagina } = await searchParams;
  const { listings } = await getCachedSaleListings();
  const byProperty = new Map(listings.flatMap((l) => (l.propertyId ? [[l.propertyId, l] as const] : [])));
  const queue = reviewQueue(listings);
  const flaggedTotal = queue.filter((r) => r.duplicateFlags.length > 0).length;
  const { items, page, pageCount } = paginate(queue, pagina, PAGE_SIZE);
  const rows: ReviewRow[] = items.map((r) => ({
    key: r.postingId,
    districtName: r.districtName,
    copies: r.copies,
    duplicateFlags: r.duplicateFlags.map((f) => {
      const other = byProperty.get(f.otherPropertyId);
      return {
        ...f,
        partner: other
          ? {
              source: other.source,
              url: other.url,
              pricePen: other.pricePen,
              areaM2: other.areaM2,
              bedrooms: other.bedrooms,
              place: other.address ?? other.title,
            }
          : null,
      };
    }),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Duplicados</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Avisos que pueden ser la misma propiedad en dos portales. Decide si son la misma, o sepáralos.
        </p>
      </div>
      <DuplicateList key={page} rows={rows} flaggedTotal={flaggedTotal} page={page} pageCount={pageCount} />
    </div>
  );
}
