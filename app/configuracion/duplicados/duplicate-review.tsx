"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { SOURCE_LABELS } from "@/lib/listing-card";
import { copySummary } from "@/lib/duplicate-queue";
import type { DuplicateFlag } from "@/lib/listing-row";
import type { ListingCopy } from "@/lib/official-price";
import { confirmDuplicate, markManualRemoved, rejectDuplicate, splitPosting, type ReviewResult } from "./actions";

/** The other property of a flagged pair, for deciding from the card. */
export type Partner = {
  source: ListingCopy["source"];
  url: string | null;
  pricePen: number;
  areaM2: number | null;
  bedrooms: number | null;
  /** Address, or the title when there is no address. */
  place: string | null;
};

export type ReviewFlag = DuplicateFlag & { partner: Partner | null };

export type ReviewRow = {
  key: string;
  districtName: string;
  copies: ListingCopy[];
  duplicateFlags: ReviewFlag[];
};

const DUPLICATE_BADGES: Partial<Record<string, string>> = {
  MEDIUM: "posible duplicado (media)",
  LOW: "posible duplicado (baja)",
};

/** "S/ 399k": short enough for the copies line. */
function formatPenK(value: number): string {
  return `S/ ${Math.round(value / 1000).toLocaleString("es-PE")}k`;
}

function ReviewButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-50"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function PartnerLine({ partner }: { partner: Partner | null }) {
  if (!partner) {
    return <p className="text-muted-foreground">La otra propiedad ya no está publicada</p>;
  }
  const label = partner.source ? SOURCE_LABELS[partner.source] : "Otra fuente";
  const facts = [
    formatPenK(partner.pricePen),
    partner.areaM2 != null ? `${partner.areaM2} m²` : null,
    partner.bedrooms != null ? `${partner.bedrooms} dorm.` : null,
    partner.place,
  ].filter(Boolean);
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
      <span>Contra:</span>
      {partner.url ? (
        <a
          href={partner.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      <span>{facts.join(" · ")}</span>
    </p>
  );
}

/**
 * One property: its copies, a split per copy when there are several, and its duplicate flags,
 * each with the other property of the pair. A refused decision keeps the row and shows the
 * message under it; a saved one is reported to the list, which updates the card at once.
 */
export type Decided = { candidateId: string } | { postingId: string };

export function DuplicateReview({ row, onDecided }: { row: ReviewRow; onDecided: (what: Decided) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { copies, duplicateFlags } = row;
  const several = copies.length > 1;
  const summary = copySummary(copies);

  // The list updates at once on success. A refusal keeps it, with the message.
  const run = (what: Decided, action: () => Promise<ReviewResult>) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) onDecided(what);
        else setError(result.error);
      } catch {
        setError("No se pudo guardar. Intenta de nuevo.");
      }
    });
  };

  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-semibold">{row.districtName}</h3>
        <span className="text-muted-foreground">
          {several
            ? `${summary.copyCount} copias · ${formatPenK(summary.minPen)} a ${formatPenK(summary.maxPen)}`
            : formatPenK(summary.minPen)}
        </span>
      </div>
      {copies.map((copy) => {
        const label = copy.source ? SOURCE_LABELS[copy.source] : "Otra fuente";
        return (
          <div key={copy.postingId} className="flex flex-wrap items-center gap-2">
            {copy.url ? (
              <a
                href={copy.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
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
                onClick={() =>
                  run({ postingId: copy.postingId }, async () => {
                    await markManualRemoved(copy.postingId);
                    return { ok: true };
                  })
                }
              />
            )}
            {several && (
              <ReviewButton
                label="no es el mismo"
                disabled={pending}
                onClick={() => run({ postingId: copy.postingId }, () => splitPosting(copy.postingId))}
              />
            )}
          </div>
        );
      })}
      {duplicateFlags.map((flag) => {
        const badge = DUPLICATE_BADGES[flag.level];
        // A level the page does not know is not shown rather than guessed.
        if (!badge) return null;
        return (
          <div key={flag.candidateId} className="space-y-1 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-amber-400 text-amber-400">
                {badge}
              </Badge>
              <ReviewButton label="es el mismo" disabled={pending} onClick={() => run({ candidateId: flag.candidateId }, () => confirmDuplicate(flag.candidateId))} />
              <ReviewButton label="no es el mismo" disabled={pending} onClick={() => run({ candidateId: flag.candidateId }, () => rejectDuplicate(flag.candidateId))} />
            </div>
            <PartnerLine partner={flag.partner} />
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
