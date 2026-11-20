"use client";

import Link from "next/link";
import { FileSpreadsheet, X } from "lucide-react";
import { CardPhoto, pen } from "@/components/listing-card";
import { Input } from "@/components/ui/input";
import type { PickView } from "@/lib/investments/pick-view";
import { NAME_MAX, NOTE_MAX } from "@/lib/investments/filters";

function PickRow({
  pick,
  onRemove,
  onNote,
}: {
  pick: PickView;
  onRemove: () => void;
  onNote: (note: string) => void;
}) {
  const title = pick.url ? (
    <a href={pick.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
      {pick.pricePen == null ? pick.title : `${pick.type === "project" ? "desde " : ""}${pen(pick.pricePen)}`}
    </a>
  ) : (
    <span>{pick.pricePen == null ? pick.title : pen(pick.pricePen)}</span>
  );
  return (
    <li className="flex gap-2.5 py-2.5">
      <span className="size-14 shrink-0 overflow-hidden rounded-md">
        <CardPhoto src={pick.imageUrl} className="size-full" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-1">
          <p className={`truncate text-sm font-semibold ${pick.gone ? "text-muted-foreground" : ""}`}>{title}</p>
          <button
            type="button"
            aria-label="Quitar de la inversión"
            onClick={onRemove}
            className="-mr-1 -mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-loss"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {pick.gone ? pick.districtName || "Sin distrito" : `${pick.title} · ${pick.districtName}`}
        </p>
        {pick.money && (
          <p className={`text-xs font-medium ${pick.money.tone === "gain" ? "text-gain" : "text-loss"}`}>{pick.money.text}</p>
        )}
        <Input
          defaultValue={pick.note ?? ""}
          maxLength={NOTE_MAX}
          placeholder="Nota"
          aria-label="Nota"
          onBlur={(e) => {
            if (e.currentTarget.value.trim() !== (pick.note ?? "")) onNote(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="mt-1 h-7 px-2 text-xs"
        />
      </div>
    </li>
  );
}

/** The inversión's name, its picks, and the ways out: Comparar and the Excel file. */
export function PickPanel({
  id,
  name,
  picks,
  rowKey,
  saveError,
  onRename,
  onRemove,
  onNote,
}: {
  id: string;
  name: string;
  picks: PickView[];
  /** A stable key per pick target, so the row keeps its draft when a temporary item gets its real id. */
  rowKey: (itemId: string) => string;
  saveError: boolean;
  onRename: (name: string) => void;
  onRemove: (itemId: string) => void;
  onNote: (itemId: string, note: string) => void;
}) {
  const n = picks.length;
  return (
    <div className="flex max-h-[75vh] lg:max-h-[calc(100vh-6rem)] flex-col rounded-xl border border-border bg-card">
      <div className="border-b border-border p-3">
        <Input
          // The key resets the field when the saved name comes back different (trimmed or empty).
          key={name}
          defaultValue={name}
          maxLength={NAME_MAX}
          aria-label="Nombre de la inversión"
          onBlur={(e) => {
            if (e.currentTarget.value !== name) onRename(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="h-8 border-transparent px-1 text-base font-semibold hover:border-input"
        />
        <p className="px-1 text-xs text-muted-foreground">{n === 1 ? "1 elegido" : `${n} elegidos`}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {n === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Agrega departamentos o proyectos con el botón + de cada tarjeta.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {picks.map((p) => (
              <PickRow key={rowKey(p.itemId)} pick={p} onRemove={() => onRemove(p.itemId)} onNote={(note) => onNote(p.itemId, note)} />
            ))}
          </ul>
        )}
      </div>
      {saveError && (
        <p role="alert" className="px-3 pb-2 text-xs text-loss">
          No se pudo guardar.
        </p>
      )}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Link
          href={`/inversiones/${id}/comparar`}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Comparar
        </Link>
        <a
          href={`/inversiones/${id}/excel`}
          aria-label="Exportar a Excel"
          title="Exportar a Excel"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-accent"
        >
          <FileSpreadsheet className="size-4" />
        </a>
      </div>
    </div>
  );
}
