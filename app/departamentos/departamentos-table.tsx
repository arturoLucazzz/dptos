"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState, useTransition } from "react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFavorites } from "@/app/providers";
import { confirmDuplicate, markManualRemoved, rejectDuplicate, splitPosting, type ReviewResult } from "@/app/actions";
import type { DepartamentosRow, DepartamentosSortId } from "@/lib/departamentos-query";
import { formatPen, formatPct } from "@/lib/listing-finance";
import { rentLine } from "@/lib/location/row-rent";
import { SOURCE_LABELS } from "@/lib/listing-card";
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
  /** Called after a duplicate decision, so the rows can be fetched again. */
  onReviewed: () => void;
}

/** Monthly gain in plain words, with the warnings an investor must see first. */
function GainCell({ row }: { row: DepartamentosRow }) {
  const { monthlyGainPen, yearlyGainPctOnCash, belowBankMinimum, outOfReach } = row;
  return (
    <div className="space-y-1 leading-tight">
      {monthlyGainPen == null ? (
        <span className="text-muted-foreground" title="Sin muestra de alquileres en el distrito">
          —
        </span>
      ) : monthlyGainPen >= 0 ? (
        <>
          <div className="font-medium text-emerald-700">Ganas {formatPen(monthlyGainPen)}/mes</div>
          {yearlyGainPctOnCash != null && (
            <div className="text-xs text-muted-foreground">
              {formatPct(yearlyGainPctOnCash)} al año sobre tu efectivo
            </div>
          )}
        </>
      ) : (
        <div className="font-medium text-red-700">Pones {formatPen(-monthlyGainPen)}/mes</div>
      )}
      {outOfReach && (
        <Badge variant="outline" className="border-red-400 text-red-800">
          Fuera de alcance: tu efectivo no cubre los gastos de compra
        </Badge>
      )}
      {belowBankMinimum && !outOfReach && (
        <Badge variant="outline" className="border-amber-400 text-amber-800">
          Inicial bajo el mínimo del banco
        </Badge>
      )}
    </div>
  );
}

function LocationCell({ row }: { row: DepartamentosRow }) {
  if (row.locationStatus === "OUTSIDE_LIMA") return <span className="text-xs text-muted-foreground">Fuera de Lima</span>;
  if (row.locationStatus === "NO_COORDINATES") {
    return <span className="text-xs text-muted-foreground">Sin ubicación exacta</span>;
  }
  if (row.locationScore == null) return <span className="text-muted-foreground">—</span>;
  const title = row.locationReasons.map((r) => r.text).join("\n");
  const tone =
    row.locationScore >= 7 ? "text-emerald-700" : row.locationScore <= 4 ? "text-red-700" : "text-foreground";
  return (
    <span className={`cursor-help font-medium tabular-nums ${tone}`} title={title}>
      {row.locationScore.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </span>
  );
}

const SORT_LABELS: Record<DepartamentosSortId, string> = {
  monthlyGain: "ganas / pones",
  pricePen: "precio",
  coverage: "% cobertura",
  aporte: "de bolsillo",
  cuota: "cuota",
  descuento: "% vs precio justo",
  inicial100: "% inicial necesario",
  location: "ubicación",
  grossYield: "rentabilidad bruta",
  cashReturn: "rinde sobre efectivo",
  pricePerM2: "precio por m²",
  entryCost: "efectivo día 1",
  newest: "más nuevos",
};

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

const DUPLICATE_BADGES: Partial<Record<string, string>> = {
  MEDIUM: "posible duplicado (media)",
  LOW: "posible duplicado (baja)",
};

/** "S/ 399k": short enough for the copies line. */
function formatPenK(value: number): string {
  return `S/ ${Math.round(value / 1000).toLocaleString("es-PE")}k`;
}

/**
 * Runs one review action and keeps its pending state and refusal message.
 * Clicks inside a row must not open the ad, so every control stops propagation.
 */
function useReview(onReviewed: () => void) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<ReviewResult>) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.error);
      } catch {
        setError("No se pudo guardar. Intenta de nuevo.");
      }
      // A refusal means the data moved on (someone already decided), so refetch either way.
      onReviewed();
    });
  };
  return { pending, error, run };
}

function ReviewButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="cursor-pointer rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-50"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

/** The ads of one property, a split per copy when there are several, and its duplicate flags. */
function SourcesCell({ row, onReviewed }: { row: DepartamentosRow; onReviewed: () => void }) {
  const { pending, error, run } = useReview(onReviewed);
  const { copies, duplicateFlags } = row;
  const several = copies.length > 1;

  return (
    <div className="space-y-1 text-xs leading-tight">
      {several && (
        <div className="text-muted-foreground">
          {copies.length} fuentes · {formatPenK(row.pricePen)} a {formatPenK(row.priceMaxPen)}
        </div>
      )}
      {copies.map((copy) => {
        const label = copy.source ? SOURCE_LABELS[copy.source] : "Otra fuente";
        return (
          <div key={copy.postingId} className="flex items-center gap-1.5">
            {copy.url ? (
              <a
                href={copy.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {label}
              </a>
            ) : (
              <span>{label}</span>
            )}
            {several && <span className="text-muted-foreground">{formatPenK(copy.pricePen)}</span>}
            {copy.source === "manual" && (
              <ReviewButton
                label="marcar vendido o retirado"
                disabled={pending}
                onClick={() => run(async () => {
                  await markManualRemoved(copy.postingId);
                  return { ok: true };
                })}
              />
            )}
            {several && (
              <ReviewButton
                label="no es el mismo"
                disabled={pending}
                onClick={() => run(() => splitPosting(copy.postingId))}
              />
            )}
          </div>
        );
      })}
      {duplicateFlags.map((flag) => {
        const badge = DUPLICATE_BADGES[flag.level];
        // A level the table does not know is not shown rather than guessed.
        if (!badge) return null;
        return (
          <div key={flag.candidateId} className="flex items-center gap-1.5">
            <Badge variant="outline" className="border-amber-400 text-amber-800">
              {badge}
            </Badge>
            <ReviewButton
              label="es el mismo"
              disabled={pending}
              onClick={() => run(() => confirmDuplicate(flag.candidateId))}
            />
            <ReviewButton
              label="no es el mismo"
              disabled={pending}
              onClick={() => run(() => rejectDuplicate(flag.candidateId))}
            />
          </div>
        );
      })}
      {error && <div className="text-red-700">{error}</div>}
    </div>
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
  onReviewed,
}: DepartamentosTableProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const hasPrepayment = data.some((r) => r.prepaymentLines != null);

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
        id: "location",
        header: () => (
          <SortHeader
            label="Ubicación"
            active={sort === "location"}
            order={order}
            onToggle={() => onSortChange("location")}
            tip="Puntaje de 0 a 10: mitad calidad de la zona (tus zonas y lugares cercanos), mitad demanda de inquilinos. Pasa el mouse sobre el número para ver las razones."
          />
        ),
        cell: ({ row }) => <LocationCell row={row.original} />,
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
        id: "fuentes",
        header: "Fuente",
        cell: ({ row }) => <SourcesCell row={row.original} onReviewed={onReviewed} />,
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
        id: "monthlyGain",
        header: () => (
          <SortHeader
            label="Ganas / Pones"
            active={sort === "monthlyGain"}
            order={order}
            onToggle={() => onSortChange("monthlyGain")}
            tip="Alquiler neto (después de mantenimiento, meses vacíos e impuesto) menos la cuota con TCEA. Ganas = te sobra cada mes. Pones = lo pagas de tu bolsillo."
          />
        ),
        cell: ({ row }) => <GainCell row={row.original} />,
      },
      {
        id: "efectivoInicial",
        header: "Efectivo inicial",
        cell: ({ row }) => formatPen(row.original.entryCostPen),
      },
      {
        id: "totalQuePones",
        header: "Total que pones",
        cell: ({ row }) => {
          const { monthlyGainPen, totalAddedUntilCrossoverPen } = row.original;
          if (monthlyGainPen == null) return "—";
          if (monthlyGainPen >= 0) return formatPen(0);
          return (
            <span title="Suma de lo que pones cada mes hasta que el alquiler, que sube cada año, cubra la cuota.">
              {formatPen(totalAddedUntilCrossoverPen)}
            </span>
          );
        },
      },
      ...(hasPrepayment
        ? ([
            {
              id: "amortizacion",
              header: "Con amortización extra",
              cell: ({ row }) => {
                const lines = row.original.prepaymentLines;
                if (!lines) return "—";
                return (
                  <div className="leading-tight">
                    <div>{lines.shorterLoan}</div>
                    <div className="text-xs text-muted-foreground">{lines.lowerPayment}</div>
                  </div>
                );
              },
            },
          ] satisfies ColumnDef<DepartamentosRow>[])
        : []),
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
            tip="% de la cuota (TCEA) que cubre el alquiler neto estimado. Debajo: el alquiler bruto usado en el cálculo, de los alquileres cercanos (o la mediana del distrito si hay pocos), y el nivel de los mejores cercanos solo como referencia."
          />
        ),
        cell: ({ row }) => {
          const { coveragePct, grossRentPen, rentSampleN, rentConfidence } = row.original;
          const line = rentLine(row.original);
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
              <div className="max-w-56 text-xs text-muted-foreground">{line}</div>
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
    [isFavorite, toggleFavorite, sort, order, onSortChange, onReviewed, hasPrepayment]
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
            orden {SORT_LABELS[sort]} ({order === "desc" ? "↓" : "↑"})
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
                      const url = row.original.url;
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
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
