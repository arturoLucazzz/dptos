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
import type { ApartmentData } from "@/app/lib/types";
import { ArrowUpDown } from "lucide-react";

interface DepartamentosTableProps {
  data: ApartmentData[];
}

export function DepartamentosTable({ data }: DepartamentosTableProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [sorting, setSorting] = useState<SortingState>([{ id: "price", desc: false }]);

  const columns = useMemo<ColumnDef<ApartmentData>[]>(
    () => [
      {
        id: "favorito",
        header: "Fav",
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isFavorite(row.original.id)}
              onCheckedChange={() => toggleFavorite(row.original.id)}
              aria-label="Marcar favorito"
            />
          </div>
        ),
      },
      {
        accessorKey: "limaDistrictName",
        id: "district",
        header: "Distrito",
        cell: ({ row }) => row.original.limaDistrictName ?? row.original.location ?? "—",
      },
      {
        accessorKey: "price",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={(e) => {
              e.stopPropagation();
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Precio
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => row.original.priceFormatted ?? "—",
        sortingFn: "basic",
      },
      {
        accessorKey: "developmentStage",
        header: "Etapa",
        cell: ({ row }) => row.original.developmentStage ?? "—",
      },
      {
        accessorKey: "deliveryDate",
        header: "Entrega",
        cell: ({ row }) => row.original.deliveryDate ?? "—",
      },
      {
        accessorKey: "bedrooms",
        header: "Dorm.",
        cell: ({ row }) => row.original.bedrooms ?? "—",
      },
      {
        accessorKey: "area",
        header: "m²",
        cell: ({ row }) => row.original.area ?? "—",
      },
    ],
    [isFavorite, toggleFavorite]
  );

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
        {data.length} resultado{data.length !== 1 ? "s" : ""}
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
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
                  onClick={() => window.open(row.original.url, "_blank", "noopener,noreferrer")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
