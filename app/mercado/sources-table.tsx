import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPenOrNoData } from "@/lib/market-chart-rows";
import type { SourceStats } from "@/lib/market-dashboard";

/** The portals the table shows, in this order. Manual listings are not a portal. */
export const PORTAL_ORDER = ["urbania", "adondevivir", "proper", "nexo"];

export function portalRows(sources: SourceStats[]): SourceStats[] {
  return PORTAL_ORDER.flatMap((id) => sources.filter((s) => s.source === id));
}

function Head({ children, hint }: { children: string; hint: string }) {
  return (
    <TableHead className="text-right">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-4">{children}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{hint}</TooltipContent>
      </Tooltip>
    </TableHead>
  );
}

export function SourcesTable({ sources, repeated }: { sources: SourceStats[]; repeated: number }) {
  const rows = portalRows(sources);
  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portal</TableHead>
              <Head hint="Avisos de venta que el portal sigue mostrando en la última corrida.">Avisos vigentes</Head>
              <Head hint="Mediana del precio de los avisos vigentes del portal, en soles.">Precio típico</Head>
              <Head hint="Avisos vistos por primera vez en los últimos 7 días.">Nuevos en 7 días</Head>
              <Head hint="Avisos que dejaron de aparecer o pasaron el corte de posiblemente vendido en los últimos 7 días.">Salieron en 7 días</Head>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.source}>
                <TableCell className="font-medium">{s.label}</TableCell>
                <TableCell className="text-right">{s.liveCount.toLocaleString("es-PE")}</TableCell>
                <TableCell className="text-right">{formatPenOrNoData(s.typicalSalePen)}</TableCell>
                <TableCell className="text-right">{s.newLast7.toLocaleString("es-PE")}</TableCell>
                <TableCell className="text-right">{s.goneLast7.toLocaleString("es-PE")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {repeated.toLocaleString("es-PE")} departamentos aparecen en 2 o más portales.
      </p>
    </div>
  );
}
