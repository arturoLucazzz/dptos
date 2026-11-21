/** Households by socioeconomic level (NSE A to E) for Lima Metropolitana. */

import { RAMP } from "@/lib/map-ramp";

/** Mid step of the map ramp, so the bars match the map. */
const NSE_BAR_COLOR = RAMP[2];

export function NseBars({ nse, source }: { nse: { level: string; pct: number }[]; source: string }) {
  if (nse.length === 0) return <p className="text-sm text-muted-foreground">sin datos</p>;
  const max = Math.max(...nse.map((n) => n.pct), 1);
  return (
    <div className="space-y-3">
      <ul className="space-y-2" aria-label="Hogares por nivel socioeconómico">
        {nse.map((n) => (
          <li key={n.level} className="flex items-center gap-3 text-sm">
            <span className="w-12 shrink-0 text-muted-foreground">NSE {n.level}</span>
            <div className="h-3 flex-1 rounded-sm bg-muted">
              <div className="h-3 rounded-sm" style={{ backgroundColor: NSE_BAR_COLOR, width: `${(n.pct / max) * 100}%` }} />
            </div>
            <span className="w-16 shrink-0 whitespace-nowrap text-right tabular-nums">{n.pct.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Hogares de Lima Metropolitana por nivel socioeconómico. Fuente: {source}.</p>
      <p className="text-xs text-muted-foreground">Ninguna fuente gratuita publica el NSE por distrito.</p>
    </div>
  );
}
