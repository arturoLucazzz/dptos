"use client";

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/app/providers";
import type { FixedAssumptions, PanelAssumptions } from "@/lib/assumption-defaults";
import type { ListingRow } from "@/lib/listing-row";
import { financeForListing, formatPen, formatPct } from "@/lib/listing-finance";
import { ArrowUpDown } from "lucide-react";

interface DepartamentosTableProps {
  data: ListingRow[];
  panel: PanelAssumptions;
  fixedAssumptions: FixedAssumptions;
}

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={(e) => {
        e.stopPropagation();
        column.toggleSorting(column.getIsSorted() === "asc");
      }}
    >
      {label}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );
}

export function DepartamentosTable({ data, panel, fixedAssumptions }: DepartamentosTableProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [sorting, setSorting] = useState<SortingState>([{ id: "coverage", desc: true }]);

  const columns = useMemo<ColumnDef<ListingRow>[]>(
    () => [
      {
        id: "favorito",
        header: "Fav",
        cell: ({ row }) => {
          const propertyId = row.original.propertyId;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isFavorite(propertyId) || row.original.favorite}
                disabled={!propertyId}
                onCheckedChange={() => propertyId && toggleFavorite(propertyId)}
                aria-label="Marcar favorito"
              />
            </div>
          );
        },
      },
      {
        accessorKey: "districtName",
        id: "district",
        header: "Distrito",
        cell: ({ row }) => row.original.districtName,
      },
      {
        accessorKey: "pricePen",
        header: ({ column }) => <SortHeader label="Precio" column={column} />,
        cell: ({ row }) => formatPen(row.original.pricePen),
        sortingFn: "basic",
      },
      {
        id: "coverage",
        accessorFn: (row) => financeForListing(row, panel, fixedAssumptions)?.coveragePct ?? -Infinity,
        header: ({ column }) => <SortHeader label="Cobertura" column={column} />,
        cell: ({ row }) => {
          const finance = financeForListing(row.original, panel, fixedAssumptions);
          if (!finance) {
            return (
              <span className="text-muted-foreground" title="Sin muestra de alquileres en el distrito">
                —
              </span>
            );
          }
          return (
            <span title={`Alquiler estimado: ${formatPen(row.original.grossRentPen)} (n=${row.original.rentSampleN ?? 0})`}>
              {formatPct(finance.coveragePct)}
            </span>
          );
        },
        sortingFn: "basic",
      },
      {
        id: "aporte",
        accessorFn: (row) =>
          financeForListing(row, panel, fixedAssumptions)?.monthlyContributionPen ?? Infinity,
        header: ({ column }) => <SortHeader label="Aporte / mes" column={column} />,
        cell: ({ row }) => {
          const finance = financeForListing(row.original, panel, fixedAssumptions);
          return formatPen(finance?.monthlyContributionPen);
        },
        sortingFn: "basic",
      },
      {
        id: "cuota",
        accessorFn: (row) => financeForListing(row, panel, fixedAssumptions)?.loan.paymentPen ?? Infinity,
        header: ({ column }) => <SortHeader label="Cuota" column={column} />,
        cell: ({ row }) => {
          const finance = financeForListing(row.original, panel, fixedAssumptions);
          return formatPen(finance?.loan.paymentPen);
        },
        sortingFn: "basic",
      },
      {
        id: "descuento",
        accessorFn: (row) => row.discountPct ?? -Infinity,
        header: ({ column }) => <SortHeader label="Descuento" column={column} />,
        cell: ({ row }) => {
          const d = row.original.discountPct;
          if (d == null) return "—";
          const tone = d >= 5 ? "text-emerald-700" : d <= -10 ? "text-red-700" : "";
          return <span className={tone}>{formatPct(d)}</span>;
        },
        sortingFn: "basic",
      },
      {
        id: "rebaja",
        accessorFn: (row) => row.priceCutScore,
        header: ({ column }) => <SortHeader label="Prob. rebaja" column={column} />,
        cell: ({ row }) => {
          const r = row.original;
          const title = [
            r.listingCount > 1 ? `${r.listingCount} avisos` : null,
            r.priceCutCount > 0 ? `${r.priceCutCount} bajada(s)` : null,
            r.totalCutPct > 0 ? `−${(r.totalCutPct * 100).toFixed(0)}% desde el pico` : null,
            r.inventoryMonths != null ? `${r.inventoryMonths.toFixed(1)} meses de inventario` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return <span title={title || "Sin señales todavía"}>{r.priceCutScore}</span>;
        },
        sortingFn: "basic",
      },
      {
        accessorKey: "bedrooms",
        header: "Dorm.",
        cell: ({ row }) => row.original.bedrooms ?? "—",
      },
      {
        accessorKey: "areaM2",
        header: "m²",
        cell: ({ row }) =>
          row.original.areaM2 != null
            ? row.original.areaM2.toLocaleString("es-PE", { maximumFractionDigits: 0 })
            : "—",
      },
      {
        id: "dias",
        accessorFn: (row) => row.daysPublished ?? -1,
        header: ({ column }) => <SortHeader label="Días" column={column} />,
        cell: ({ row }) => {
          const d = row.original.daysPublished;
          if (d == null) return "—";
          return (
            <span title={row.original.daysPublishedEstimated ? "Estimado desde el id de Urbania" : "Fecha reportada"}>
              {d}
              {row.original.daysPublishedEstimated ? "~" : ""}
            </span>
          );
        },
        sortingFn: "basic",
      },
      {
        id: "inicial100",
        accessorFn: (row) =>
          financeForListing(row, panel, fixedAssumptions)?.downPaymentPctForFullCoverage ?? Infinity,
        header: ({ column }) => <SortHeader label="Inicial p/ 100%" column={column} />,
        cell: ({ row }) => {
          const finance = financeForListing(row.original, panel, fixedAssumptions);
          return formatPct(finance?.downPaymentPctForFullCoverage, 0);
        },
        sortingFn: "basic",
      },
    ],
    [isFavorite, toggleFavorite, panel, fixedAssumptions]
  );

  // TanStack Table returns unstable function identities; React Compiler skips
  // memoizing this on purpose.
  // eslint-disable-next-line react-hooks/incompatible-library -- expected with useReactTable
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.length} resultado{data.length !== 1 ? "s" : ""} · orden por cobertura (recalcula con los
          supuestos)
        </p>
        <p className="text-xs text-muted-foreground">
          El descuento vs precio justo es un generador de shortlist, no un veredicto: lo barato suele
          estarlo por razones que los datos no ven.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="whitespace-nowrap">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Sin resultados
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => {
                    const path = row.original.sourcePath;
                    if (path) window.open(`https://urbania.pe${path}`, "_blank", "noopener,noreferrer");
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
