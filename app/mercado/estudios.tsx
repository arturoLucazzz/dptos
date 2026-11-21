import { ExternalLink } from "lucide-react";
import type { Estudio } from "@/lib/market-files";

export function Estudios({ estudios }: { estudios: Estudio[] }) {
  if (estudios.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay estudios.</p>;
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {estudios.map((e) => (
        <li key={e.url} className="space-y-1 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{e.titulo}</h3>
          <p className="text-xs text-muted-foreground">
            {e.autor} · {e.frecuencia}
          </p>
          {e.nota && <p className="text-sm">{e.nota}</p>}
          {e.preciosDeAviso && <p className="text-xs text-muted-foreground">Son precios de aviso, no de venta.</p>}
          <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Abrir el estudio <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
