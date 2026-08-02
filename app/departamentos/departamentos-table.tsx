"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFavorites } from "@/app/providers";
import type { DepartamentosRow, DepartamentosSortId } from "@/lib/departamentos-query";
import { formatPen, formatPct } from "@/lib/listing-finance";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface DepartamentosTableProps {
  data: DepartamentosRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: DepartamentosSortId;
  order: "asc" | "desc";
  isValidating?: boolean;
  onSortChange: (sort: DepartamentosSortId) => void;
  onPageChange: (page: number) => void;
}

function SortHeader({
  label,
  active,
  order,
  tip,
  onToggle,
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  tip?: string;
  onToggle: () => void;
}) {
  const SortIcon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;

  const button = (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-2 cursor-pointer", active && "text-foreground")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {label}
      <SortIcon className="ml-2 h-4 w-4" />
    </Button>
  );

  if (!tip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

export function DepartamentosTable({
  data,
  total,
  page,
  pageSize,
  sort,
  order,
  isValidating,
  onSortChange,
  onPageChange,
}: DepartamentosTableProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);

  const columns = useMemo<ColumnDef<DepartamentosRow>[]>(
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
              className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted-foreground hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
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
        header: () => (
          <SortHeader
            label="Precio"
            active={sort === "pricePen"}
            order={order}
            onToggle={() => onSortChange("pricePen")}
          />
        ),
        cell: ({ row }) => formatPen(row.original.pricePen),
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
        header: () => (
          <SortHeader
            label="Cuota"
            active={sort === "cuota"}
            order={order}
            onToggle={() => onSortChange("cuota")}
            tip="Pago mensual del préstamo con tu hipoteca (precio, inicial %, TCEA, plazo)."
          />
        ),
        cell: ({ row }) => formatPen(row.original.paymentPen),
      },
      {
        id: "coverage",
        header: () => (
          <SortHeader
            label="% cobertura"
            active={sort === "coverage"}
            order={order}
            onToggle={() => onSortChange("coverage")}
            tip="% de la cuota (TCEA) que cubre el alquiler neto estimado. Debajo se muestra el alquiler bruto promedio (mediana distrito × dormitorios) usado en el cálculo."
          />
        ),
        cell: ({ row }) => {
          const { coveragePct, grossRentPen, rentSampleN, rentConfidence } = row.original;
          if (coveragePct == null) {
            return (
              <span className="text-muted-foreground" title="Sin muestra de alquileres en el distrito">
                —
              </span>
            );
          }
          return (
            <div
              className="leading-tight"
              title={`Alquiler estimado: ${formatPen(grossRentPen)} (n=${rentSampleN ?? 0}${
                rentConfidence ? `, ${rentConfidence}` : ""
              })`}
            >
              <div>{formatPct(coveragePct)}</div>
              <div className="text-xs text-muted-foreground">
                alquiler {formatPen(grossRentPen)}
              </div>
            </div>
          );
        },
      },
      {
        id: "aporte",
        header: () => (
          <SortHeader
            label="De bolsillo"
            active={sort === "aporte"}
            order={order}
            onToggle={() => onSortChange("aporte")}
            tip="Lo que falta poner de tu bolsillo cada mes: cuota − alquiler neto."
          />
        ),
        cell: ({ row }) => formatPen(row.original.monthlyContributionPen),
      },
      {
        id: "descuento",
        header: () => (
          <SortHeader
            label="% vs precio justo"
            active={sort === "descuento"}
            order={order}
            onToggle={() => onSortChange("descuento")}
            tip="Diferencia vs el precio que estima el modelo. Verde = pides menos que el precio justo (oportunidad). Rojo = pides más que el precio justo (sobreprecio)."
          />
        ),
        cell: ({ row }) => {
          const d = row.original.discountPct;
          if (d == null) return "—";
          // Positive discountPct = asking below model (good). Negative = above model (bad).
          const tone = d > 0 ? "text-emerald-700" : d < 0 ? "text-red-700" : "";
          return <span className={tone}>{formatPct(d)}</span>;
        },
      },
      {
        id: "inicial100",
        header: () => (
          <SortHeader
            label="% inicial necesario"
            active={sort === "inicial100"}
            order={order}
            onToggle={() => onSortChange("inicial100")}
            tip="Enganche requerido para que el alquiler cubra el 100% de la cuota."
          />
        ),
        cell: ({ row }) => formatPct(row.original.downPaymentPctForFullCoverage, 0),
      },
    ],
    [isFavorite, toggleFavorite, sort, order, onSortChange]
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- expected with useReactTable
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  return (
    <TooltipProvider>
      <div className={cn("space-y-4", isValidating && "opacity-70")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("es-PE")} resultado{total !== 1 ? "s" : ""}
            {" · "}
            página {page} de {pageCount}
            {" · "}
            orden {sort} ({order === "desc" ? "↓" : "↑"})
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/*
          Avoid the shared Table wrapper (relative + overflow-auto): that makes
          position:sticky attach to the table box instead of the page viewport.
        */}
        <div className="rounded-md border">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-14 z-20 bg-background shadow-[0_1px_0_0_hsl(var(--border))] [&_th]:bg-background">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-background">
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
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
