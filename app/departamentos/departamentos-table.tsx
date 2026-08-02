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
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/app/providers";
import type { FixedAssumptions, PanelAssumptions } from "@/lib/assumption-defaults";
import type { ListingRow } from "@/lib/listing-row";
import { financeForListing, formatPen, formatPct, loanForListing } from "@/lib/listing-finance";
import { ArrowUpDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface DepartamentosTableProps {
  data: ListingRow[];
  panel: PanelAssumptions;
  fixedAssumptions: FixedAssumptions;
}

function SortHeader({
  label,
  column,
  title,
}: {
  label: string;
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  title?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      title={title}
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
        header: () => <span className="sr-only">Favorito</span>,
        cell: ({ row }) => {
          const propertyId = row.original.propertyId;
          const favorited = Boolean(propertyId && (isFavorite(propertyId) || row.original.favorite));
          return (
            <button
              type="button"
              disabled={!propertyId}
              aria-label={favorited ? "Quitar de favoritos" : "Marcar favorito"}
              className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-amber-500 disabled:opacity-40"
              onClick={(e) => {
                e.stopPropagation();
                if (propertyId) toggleFavorite(propertyId);
              }}
            >
              <Star
                className={cn("h-4 w-4", favorited && "fill-amber-400 text-amber-500")}
              />
            </button>
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
        accessorKey: "areaM2",
        header: "m²",
        cell: ({ row }) =>
          row.original.areaM2 != null
            ? row.original.areaM2.toLocaleString("es-PE", { maximumFractionDigits: 0 })
            : "—",
      },
      {
        accessorKey: "bedrooms",
        header: "Dorm.",
        cell: ({ row }) => row.original.bedrooms ?? "—",
      },
      {
        id: "cuota",
        accessorFn: (row) => loanForListing(row, panel, fixedAssumptions)?.paymentPen ?? Infinity,
        header: ({ column }) => (
          <SortHeader
            label="Cuota"
            column={column}
            title="Pago mensual del préstamo con tus supuestos"
          />
        ),
        cell: ({ row }) => {
          const loan = loanForListing(row.original, panel, fixedAssumptions);
          return formatPen(loan?.paymentPen);
        },
        sortingFn: "basic",
      },
      {
        id: "coverage",
        accessorFn: (row) => financeForListing(row, panel, fixedAssumptions)?.coveragePct ?? -Infinity,
        header: ({ column }) => (
          <SortHeader
            label="% cobertura"
            column={column}
            title="% de la cuota que cubre el alquiler neto estimado"
          />
        ),
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
        header: ({ column }) => (
          <SortHeader
            label="De bolsillo"
            column={column}
            title="Cuota − alquiler neto: lo que pones de tu bolsillo cada mes"
          />
        ),
        cell: ({ row }) => {
          const finance = financeForListing(row.original, panel, fixedAssumptions);
          return formatPen(finance?.monthlyContributionPen);
        },
        sortingFn: "basic",
      },
      {
        id: "descuento",
        accessorFn: (row) => row.discountPct ?? -Infinity,
        header: ({ column }) => (
          <SortHeader
            label="% vs precio justo"
            column={column}
            title="Diferencia vs el precio que estima el modelo. Positivo = más barato que el modelo"
          />
        ),
        cell: ({ row }) => {
          const d = row.original.discountPct;
          if (d == null) return "—";
          const tone = d >= 5 ? "text-emerald-700" : d <= -10 ? "text-red-700" : "";
          return <span className={tone}>{formatPct(d)}</span>;
        },
        sortingFn: "basic",
      },
      {
        id: "inicial100",
        accessorFn: (row) =>
          financeForListing(row, panel, fixedAssumptions)?.downPaymentPctForFullCoverage ?? Infinity,
        header: ({ column }) => (
          <SortHeader
            label="% inicial necesario"
            column={column}
            title="Enganche requerido para que el alquiler cubra el 100% de la cuota"
          />
        ),
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
      <p className="text-sm text-muted-foreground">
        {data.length} resultado{data.length !== 1 ? "s" : ""} · orden por % cobertura (recalcula con los
        supuestos)
      </p>
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
