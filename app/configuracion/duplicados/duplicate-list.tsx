"use client";

import { useState } from "react";
import { DuplicateReview, type ReviewRow } from "./duplicate-review";

/** The rows of one page. A decided row is dropped here at once, without rendering the page again. */
export function DuplicateList({ rows, total }: { rows: ReviewRow[]; total: number }) {
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const left = total - decided.size;
  const visible = rows.filter((r) => !decided.has(r.key));

  return (
    <>
      <p className="text-sm text-muted-foreground">{left} por revisar</p>
      {left === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No hay duplicados por revisar.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <DuplicateReview key={row.key} row={row} onDecided={() => setDecided((s) => new Set(s).add(row.key))} />
          ))}
        </ul>
      )}
    </>
  );
}
