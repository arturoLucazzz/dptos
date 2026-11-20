"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createInvestment } from "@/app/inversiones/actions";
import { markInversionesChanged } from "@/app/inversiones/history-refresh";
import { Button } from "@/components/ui/button";
import { useInicioInversion } from "./inicio-inversion";

export function ContinueCard() {
  const { current, others } = useInicioInversion();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  async function create() {
    setCreating(true);
    setFailed(false);
    try {
      const inv = await createInvestment();
      markInversionesChanged();
      router.push(`/inversiones/${inv.id}`);
    } catch {
      setFailed(true);
      setCreating(false);
    }
  }

  const n = current?.items.length ?? 0;
  const thumbs = current?.items.slice(0, 5) ?? [];
  const openClass = "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent";
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Continuar</p>
        {current ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{current.name}</p>
              <p className="text-sm text-muted-foreground">{n} elegidos</p>
            </div>
            <div className="flex items-center gap-3">
              {n > 0 && (
                <div className="flex -space-x-2">
                  {thumbs.map((t) => (
                    <span key={t.id} className="size-9 overflow-hidden rounded-full border-2 border-card bg-gradient-to-br from-muted to-secondary">
                      {t.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.imageUrl} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="size-full object-cover" />
                      )}
                    </span>
                  ))}
                </div>
              )}
              {current.id ? (
                <Link href={`/inversiones/${current.id}`} className={openClass}>
                  Abrir
                </Link>
              ) : (
                <span className={`${openClass} opacity-50`}>Abrir</span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Todavía no tienes inversiones.</p>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Otras inversiones</p>
        {others.length > 0 && (
          <ul className="mt-1 space-y-1 text-sm">
            {others.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <Link href={`/inversiones/${o.id}`} className="truncate hover:underline">
                  {o.name}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{o.count}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={creating} onClick={() => void create()}>
            + Nueva inversión
          </Button>
          {others.length > 0 && (
            <Link href="/inversiones" className="text-xs text-muted-foreground hover:underline">
              Ver todas
            </Link>
          )}
        </div>
        {failed && <p className="mt-2 text-xs text-loss">No se pudo guardar.</p>}
      </div>
    </div>
  );
}
