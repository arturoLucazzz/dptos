"use client";

import { MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocationReason } from "@/lib/location/score";

const EXPLANATION =
  "Mitad calidad de la zona (tus zonas y lugares a menos de 500 m) y mitad demanda de inquilinos (alquileres cerca, ingresos y pobreza del distrito). 10 es el mejor lugar entre los departamentos que sigue dptos.";

/** Violet location badge with its explanation; shows nothing when the score is null. */
export function ScoreBadge({ score, reasons }: { score: number | null; reasons: LocationReason[] }) {
  if (score == null) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-full bg-score px-2 py-0.5 text-xs font-semibold text-white shadow">
            <MapPin aria-hidden className="size-3" />
            {score.toFixed(1)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1.5 text-left">
          <p className="font-semibold">Ubicación {score.toFixed(1)} de 10</p>
          <p>{EXPLANATION}</p>
          {reasons.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4">
              {reasons.map((r, i) => (
                <li key={i}>{r.text}</li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
