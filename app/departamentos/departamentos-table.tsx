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
import { ArrowUpDown, ExternalLink } from "lucide-react";

export interface DistrictOption {
  value: string;
  label: string;
}

interface DepartamentosTableProps {
  data: ApartmentData[];
  districtOptions: DistrictOption[];
}

export function DepartamentosTable({ data, districtOptions }: DepartamentosTableProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [sorting, setSorting] = useState<SortingState>([{ id: "price", desc: false }]);
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = [...data];
    if (districtFilter !== "all") {
      list = list.filter((r) => r.limaDistrictSlug === districtFilter);
    }
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    if (min != null && !Number.isNaN(min)) list = list.filter((r) => r.price != null && r.price >= min);
    if (max != null && !Number.isNaN(max)) list = list.filter((r) => r.price != null && r.price <= max);
    if (stageFilter !== "all") {
      list = list.filter((r) => (r.developmentStage ?? "") === stageFilter);
    }
    return list;
  }, [data, districtFilter, priceMin, priceMax, stageFilter]);

  const allDistrictOptions = useMemo(
    () => [{ value: "all", label: "Todos los distritos" }, ...districtOptions],
    [districtOptions]
  );

  const columns = useMemo<ColumnDef<ApartmentData>[]>(
    () => [
      {
        id: "favorito",
        header: "Fav",
        cell: ({ row }) => (
          <Checkbox
            checked={isFavorite(row.original.id)}
            onCheckedChange={() => toggleFavorite(row.original.id)}
            aria-label="Marcar favorito"
          />
        ),
      },
      {
        accessorKey: "title",
        header: "Título",
        cell: ({ row }) => (
          <span className="max-w-[280px] truncate block" title={row.original.title ?? ""}>
            {row.original.title ?? "—"}
          </span>
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
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
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
      {
        accessorKey: "propertyType",
        header: "Tipo",
        cell: ({ row }) => row.original.propertyType ?? "—",
      },
      {
        id: "link",
        header: "",
        cell: ({ row }) => (
          <a
            href={row.original.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            aria-label="Abrir enlace"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ),
      },
    ],
    [isFavorite, toggleFavorite]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const stageOptions = [
    { value: "all", label: "Todas las etapas" },
    { value: "Entrega inmediata", label: "Entrega inmediata" },
    { value: "En construcción", label: "En construcción" },
    { value: "En planos", label: "En planos" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Distrito</label>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {allDistrictOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Precio mín</label>
          <input
            type="number"
            placeholder="Ej. 100000"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Precio máx</label>
          <input
            type="number"
            placeholder="Ej. 500000"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Etapa</label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {stageOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
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
                <TableRow key={row.id}>
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
