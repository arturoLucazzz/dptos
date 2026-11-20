"use client";

import { AddButton, CardFrame, pen } from "@/components/listing-card";
import type { ProjectRow } from "@/lib/project-rows";

/** A project card: a "desde" price and the delivery date in place of the money line. */
export function ProjectCard({ row, added, onAdd }: { row: ProjectRow; added: boolean; onAdd(): void }) {
  return (
    <CardFrame url={row.url} imageUrl={row.imageUrl} topLeft={<AddButton added={added} onAdd={onAdd} />}>
      <p className="text-base font-semibold">{row.priceFromPen == null ? "Precio no publicado" : `desde ${pen(row.priceFromPen)}`}</p>
      <p className="truncate text-xs text-muted-foreground">
        {row.name} · {row.districtName}
      </p>
      {row.deliveryDate && <p className="text-xs text-muted-foreground">Entrega {row.deliveryDate}</p>}
    </CardFrame>
  );
}
