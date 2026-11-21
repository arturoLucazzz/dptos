"use client";

import Link from "next/link";
import { useState } from "react";
import { applyDecisions } from "@/lib/duplicate-queue";
import { DuplicateReview, type Decided, type ReviewRow } from "./duplicate-review";

const pagerLink = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent";

/**
 * The rows of one page. A decision updates the list here without rendering the page again:
 * the decided flag leaves both rows of its pair, a split copy leaves its row, and a row goes
 * only when it has no flag and fewer than 2 copies left.
 */
export function DuplicateList({
  rows,
  total,
  page,
  pageCount,
}: {
  rows: ReviewRow[];
  total: number;
  page: number;
  pageCount: number;
}) {
  const [candidateIds, setCandidateIds] = useState<ReadonlySet<string>>(new Set());
  const [postingIds, setPostingIds] = useState<ReadonlySet<string>>(new Set());
  const visible = applyDecisions(rows, { candidateIds, postingIds });
  const left = total - (rows.length - visible.length);

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
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No quedan duplicados en esta página.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <DuplicateReview key={row.key} row={row} onDecided={onDecided} />
          ))}
        </ul>
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
