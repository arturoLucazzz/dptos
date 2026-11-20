"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CardPhoto } from "@/components/listing-card";

export type CompareColumn = { itemId: string; title: string; districtName: string; imageUrl: string | null; note: string | null; url: string | null; gone: boolean };
export type CompareTableRows = { label: string; cells: { text: string; best: boolean }[] }[];

export function CompareView({ columns, table }: { columns: CompareColumn[]; table: CompareTableRows }) {
  const [idx, setIdx] = useState(0);
  // Below md only the current pick shows; from md up every pick is a column.
  const show = (i: number) => (i === idx ? "table-cell" : "hidden") + " md:table-cell";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between md:hidden">
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          <ChevronLeft className="size-4" /> Anterior
        </button>
        <span className="text-xs text-muted-foreground">
          {idx + 1} de {columns.length}
        </span>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(columns.length - 1, i + 1))}
          disabled={idx === columns.length - 1}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Siguiente <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="align-top">
              <th className="w-36 p-2 text-left text-xs font-normal text-muted-foreground" />
              {columns.map((c, i) => (
                <th key={c.itemId} className={`${show(i)} min-w-40 p-2 text-left font-normal`}>
                  <span className="mb-2 block aspect-[4/3] max-w-52 overflow-hidden rounded-md">
                    <CardPhoto src={c.imageUrl} className="size-full" />
                  </span>
                  <span className={`block text-sm font-semibold ${c.gone ? "text-muted-foreground" : ""}`}>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )}
                  </span>
                  {c.districtName && <span className="block text-xs text-muted-foreground">{c.districtName}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.label} className="border-t">
                <th scope="row" className="p-2 text-left text-xs font-normal text-muted-foreground">
                  {r.label}
                </th>
                {r.cells.map((cell, i) => (
                  <td key={columns[i].itemId} className={`${show(i)} p-2 tabular-nums ${cell.best ? "font-semibold text-gain" : ""}`}>
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t align-top">
              <th scope="row" className="p-2 text-left text-xs font-normal text-muted-foreground">
                Nota
              </th>
              {columns.map((c, i) => (
                <td key={c.itemId} className={`${show(i)} p-2 text-xs`}>
                  {c.note || "-"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
