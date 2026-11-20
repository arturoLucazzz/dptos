"use client";

import { useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocationReason } from "@/lib/location/score";

const EXPLANATION =
  "Mitad calidad de la zona (tus zonas y lugares a menos de 500 m) y mitad demanda de inquilinos (alquileres cerca, ingresos y pobreza del distrito). 10 es el mejor lugar entre los departamentos que sigue dptos.";

/**
 * Violet location badge with its explanation; shows nothing when the score is null.
 * Hover opens it with a mouse; a tap toggles it on a touch screen and never opens the listing.
 * Needs the one TooltipProvider in the root layout.
 */
export function ScoreBadge({ score, reasons }: { score: number | null; reasons: LocationReason[] }) {
  const [open, setOpen] = useState(false);
  // A tap focuses the button, and focus opens the tooltip before the click, so the click
  // decides from the state the tap started with.
  const touch = useRef(false);
  const wasOpen = useRef(false);
  if (score == null) return null;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Ubicación ${score.toFixed(1)} de 10`}
          onPointerDown={(e) => {
            touch.current = e.pointerType !== "mouse";
            wasOpen.current = open;
          }}
          onClick={(e) => {
            // Never let the tap reach a card link behind the badge.
            e.stopPropagation();
            if (touch.current) {
              // preventDefault also stops Radix from closing the tooltip on click.
              e.preventDefault();
              setOpen(!wasOpen.current);
            }
            touch.current = false;
          }}
          className="inline-flex items-center gap-1 rounded-full bg-score px-2 py-0.5 text-xs font-semibold text-white shadow"
        >
          <MapPin aria-hidden className="size-3" />
          {score.toFixed(1)}
        </button>
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
  );
}
