import { ExternalLink } from "lucide-react";
import type { Voz } from "@/lib/market-files";

/** `voces` must already be the reviewed ones (loadVoces with onlyReviewed). */
export function Voces({ voces }: { voces: Voz[] }) {
  if (voces.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay voces revisadas.</p>;
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {voces.map((v) => (
        <li key={v.url} className="space-y-1 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{v.nombre}</h3>
            {v.vendeAsesoria && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">vende asesoría</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {v.plataforma} · {v.tema}
          </p>
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Abrir <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
