import { getCachedSaleListings } from "@/lib/listings";
import { duplicateQueue } from "@/lib/duplicate-queue";
import { DuplicateReview, type ReviewRow } from "./duplicate-review";

export const dynamic = "force-dynamic";

export default async function DuplicadosPage() {
  const { listings } = await getCachedSaleListings();
  const rows: ReviewRow[] = duplicateQueue(listings).map((r) => ({
    key: r.postingId,
    districtName: r.districtName,
    pricePen: r.pricePen,
    priceMaxPen: r.priceMaxPen,
    copies: r.copies,
    duplicateFlags: r.duplicateFlags,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Duplicados</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Avisos que pueden ser la misma propiedad en dos portales. Decide si son la misma, o sepáralos.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No hay duplicados por revisar.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <DuplicateReview key={row.key} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
