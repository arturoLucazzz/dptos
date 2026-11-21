"use client";

import { useSyncExternalStore } from "react";
import type { DistrictPanel as Panel, PanelLine } from "@/lib/district-panel";

function subscribe(onChange: () => void): () => void {
  const q = window.matchMedia("(hover: hover)");
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
}

/** True with a mouse; false on a touch screen, and on the server. */
function useCanHover(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia("(hover: hover)").matches, () => true);
}

function Lines({ lines }: { lines: PanelLine[] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
      {lines.map((l) => (
        <div key={l.label} className="contents">
          <dt className="text-muted-foreground">{l.label}</dt>
          <dd className={l.value === "sin datos" ? "text-right text-muted-foreground" : "text-right font-medium"}>{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The facts of one district beside the map; it keeps the last district after the mouse leaves. */
export function DistrictPanel({ panel }: { panel: Panel | null }) {
  const canHover = useCanHover();
  return (
    <aside data-district-panel className="space-y-4 rounded-xl border border-border bg-card p-4">
      {panel == null ? (
        <p className="text-sm text-muted-foreground">{canHover ? "Pasa el mouse sobre un distrito" : "Toca un distrito"}</p>
      ) : (
        <>
          <div>
            <h3 className="text-base font-semibold">{panel.title}</h3>
            {panel.zone && <p className="text-xs text-muted-foreground">Zona {panel.zone}</p>}
          </div>
          <Lines lines={panel.lines} />
          {panel.market && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mercado en dptos</h4>
              <Lines lines={panel.market} />
            </div>
          )}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estratos de ingreso (INEI 2020)</h4>
            <ul className="space-y-1.5">
              {panel.strata.map((s) => (
                <li key={s.label} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span>
                      {s.label} <span className="text-muted-foreground">· {s.range}</span>
                    </span>
                    <span className={s.pct == null ? "text-muted-foreground" : "font-medium"}>
                      {s.pct == null ? "sin datos" : `${s.pct.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">Ingreso mensual por persona del hogar.</p>
          </div>
          <p className="text-[11px] text-muted-foreground">{panel.sources}</p>
        </>
      )}
    </aside>
  );
}
