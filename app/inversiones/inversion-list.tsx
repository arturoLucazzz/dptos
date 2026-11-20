"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardPhoto } from "@/components/listing-card";
import { createInvestment, deleteInvestment, renameInvestment } from "./actions";
import { markInversionesChanged } from "./history-refresh";

export type InversionSummary = { id: string; name: string; count: number; thumbs: string[] };

export function picksLabel(n: number): string {
  return n === 1 ? "1 elegido" : `${n} elegidos`;
}

function InversionRow({
  inv,
  onRename,
  onDelete,
}: {
  inv: InversionSummary;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const name = inv.name;

  const save = (value: string) => {
    setEditing(false);
    if (value.trim() === "" || value === name) return;
    void onRename(value);
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            defaultValue={name}
            maxLength={80}
            aria-label="Nombre de la inversión"
            onBlur={(e) => save(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = name;
                e.currentTarget.blur();
              }
            }}
            className="h-8 max-w-sm"
          />
        ) : (
          <Link href={`/inversiones/${inv.id}`} className="block truncate text-lg font-semibold hover:underline">
            {name}
          </Link>
        )}
        <p className="text-sm text-muted-foreground">{picksLabel(inv.count)}</p>
      </div>
      {inv.thumbs.length > 0 && (
        <div className="flex -space-x-2">
          {inv.thumbs.map((src, i) => (
            <span key={i} className="size-10 overflow-hidden rounded-full border-2 border-card">
              <CardPhoto src={src} className="size-full" />
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Cambiar nombre" onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Borrar" onClick={onDelete} className="hover:text-loss">
          <Trash2 />
        </Button>
        <Link
          href={`/inversiones/${inv.id}`}
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
        >
          Abrir
        </Link>
      </div>
    </li>
  );
}

export function InversionList({ investments }: { investments: InversionSummary[] }) {
  const router = useRouter();
  const [list, setList] = useState(investments);
  const [confirm, setConfirm] = useState<InversionSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Each call catches its own error: a failure shows a short message, never an error screen.
  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setSaveError(false);
    try {
      await work();
      markInversionesChanged();
    } catch {
      setSaveError(true);
    } finally {
      setPending(false);
    }
  };

  const create = () =>
    run(async () => {
      const inv = await createInvestment();
      router.push(`/inversiones/${inv.id}`);
    });

  const remove = (inv: InversionSummary) =>
    run(async () => {
      try {
        await deleteInvestment(inv.id);
        setList((l) => l.filter((x) => x.id !== inv.id));
      } finally {
        setConfirm(null);
      }
    });

  const rename = (inv: InversionSummary, value: string) =>
    run(async () => {
      const saved = await renameInvestment(inv.id, value);
      setList((l) => l.map((x) => (x.id === inv.id ? { ...x, name: saved.name } : x)));
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void create()} disabled={pending}>
          + Nueva inversión
        </Button>
        {saveError && (
          <p role="alert" className="text-sm text-loss">
            No se pudo guardar.
          </p>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no tienes inversiones.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((inv) => (
            <InversionRow
              key={inv.id}
              inv={inv}
              onRename={(value) => rename(inv, value)}
              onDelete={() => setConfirm(inv)}
            />
          ))}
        </ul>
      )}
      <Dialog open={confirm != null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar inversión</DialogTitle>
            <DialogDescription>
              ¿Borrar la inversión {confirm?.name}? Se pierden sus elegidos y notas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending}
              onClick={() => confirm && void remove(confirm)}
              className="bg-loss text-white hover:bg-loss/90"
            >
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
