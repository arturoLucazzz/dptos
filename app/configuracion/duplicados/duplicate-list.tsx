"use client";

import Link from "next/link";
import { useState } from "react";
import { applyDecisions } from "@/lib/duplicate-queue";
import { DuplicateReview, type Decided, type ReviewRow } from "./duplicate-review";

const pagerLink = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent";

/**
 * The rows of one page. A decision updates the list here without rendering the page again:
 * a decided flag leaves its card, a split copy leaves its row, and a row goes only when it
 * has no flag and fewer than 2 copies left. Rows with several copies and no flag sit in a
 * collapsed section below the flags and do not count as "por revisar".
 */
export function DuplicateList({
  rows,
  flaggedTotal,
  page,
  pageCount,
}: {
  rows: ReviewRow[];
  /** Rows with a flag in the whole queue, on every page. */
  flaggedTotal: number;
  page: number;
  pageCount: number;
}) {
  const [candidateIds, setCandidateIds] = useState<ReadonlySet<string>>(new Set());
  const [postingIds, setPostingIds] = useState<ReadonlySet<string>>(new Set());
  const visible = applyDecisions(rows, { candidateIds, postingIds });
  const flagged = visible.filter((r) => r.duplicateFlags.length > 0);
  const multi = visible.filter((r) => r.duplicateFlags.length === 0);
  // Flagged rows of this page that lost their flags no longer count, even when they stay as multi-copy rows.
  const left = flaggedTotal - (rows.filter((r) => r.duplicateFlags.length > 0).length - flagged.length);

  const onDecided = (what: Decided) => {
    if ("candidateId" in what) setCandidateIds((s) => new Set(s).add(what.candidateId));
    else setPostingIds((s) => new Set(s).add(what.postingId));
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">{left} por revisar</p>
      {left === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No hay duplicados por revisar.
        </p>
      ) : flagged.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No quedan duplicados en esta página.
        </p>
      ) : (
        <ul className="space-y-3">
          {flagged.map((row) => (
            <DuplicateReview key={row.key} row={row} onDecided={onDecided} />
          ))}
        </ul>
      )}
      {multi.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Propiedades con varias copias ({multi.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {multi.map((row) => (
              <DuplicateReview key={row.key} row={row} onDecided={onDecided} />
            ))}
          </ul>
        </details>
      )}
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
    </>
  );
}
