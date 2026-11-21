import Link from "next/link";
import { getCachedSaleListings } from "@/lib/listings";
import { duplicateQueue } from "@/lib/duplicate-queue";
import { paginate } from "@/lib/paginate";
import { DuplicateList } from "./duplicate-list";
import type { ReviewRow } from "./duplicate-review";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const pagerLink = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent";

export default async function DuplicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  const { pagina } = await searchParams;
  const { listings } = await getCachedSaleListings();
  const { items, page, pageCount, total } = paginate(duplicateQueue(listings), pagina, PAGE_SIZE);
  const rows: ReviewRow[] = items.map((r) => ({
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
      <DuplicateList key={page} rows={rows} total={total} />
      {pageCount > 1 && (
        <nav aria-label="Páginas" className="flex items-center gap-3">
          {page > 1 && (
            <Link href={`/configuracion/duplicados?pagina=${page - 1}`} className={pagerLink}>
              Anterior
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Página {page} de {pageCount}
          </span>
          {page < pageCount && (
            <Link href={`/configuracion/duplicados?pagina=${page + 1}`} className={pagerLink}>
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
