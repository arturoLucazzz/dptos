"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { addPick, createInvestment, removePick } from "@/app/inversiones/actions";
import { markInversionesChanged } from "@/app/inversiones/history-refresh";

export type InicioItem = { id: string; propertyId: string | null; projectId: string | null; imageUrl: string | null };
export type InicioInversion = { id: string; name: string; items: InicioItem[] };
export type OtherInversion = { id: string; name: string; count: number };

const TEMP = "temp:";
const DEFAULT_NAME = "Mi inversión";

type Ctx = {
  current: InicioInversion | null;
  others: OtherInversion[];
  isAdded: (propertyId: string | null | undefined) => boolean;
  toggle: (target: { propertyId: string | null; imageUrl: string | null }) => void;
};

const InicioContext = createContext<Ctx | null>(null);

export function useInicioInversion(): Ctx {
  const ctx = useContext(InicioContext);
  if (!ctx) throw new Error("useInicioInversion must be used within InicioInversionProvider");
  return ctx;
}

/**
 * The last opened inversión, shared by Continuar and the + buttons. The server sends the
 * first state; adds and removes update it at once and roll back when the save fails.
 */
export function InicioInversionProvider({
  initial,
  others,
  children,
}: {
  initial: InicioInversion | null;
  others: OtherInversion[];
  children: React.ReactNode;
}) {
  const target = useRef<{ id: string; name: string } | null>(initial ? { id: initial.id, name: initial.name } : null);
  const [current, setCurrent] = useState<InicioInversion | null>(initial);
  // A refresh (Back or Forward after a change) sends new server data: show it, not the old state.
  const [seen, setSeen] = useState({ initial, others });
  if (seen.initial !== initial || seen.others !== others) {
    setSeen({ initial, others });
    setCurrent(initial);
    target.current = initial ? { id: initial.id, name: initial.name } : null;
  }
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const tempCounter = useRef(0);
  // The real inversión the next pick goes to; null until "Mi inversión" is created.
  const creating = useRef<Promise<{ id: string; name: string }> | null>(null);

  const show = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  const ensureInvestment = useCallback(async () => {
    if (target.current) return target.current;
    creating.current ??= createInvestment(DEFAULT_NAME).then((inv) => {
      target.current = { id: inv.id, name: inv.name };
      return target.current;
    });
    try {
      return await creating.current;
    } finally {
      creating.current = null;
    }
  }, []);

  const add = useCallback(
    async (propertyId: string, imageUrl: string | null) => {
      const temp: InicioItem = { id: `${TEMP}${++tempCounter.current}`, propertyId, projectId: null, imageUrl };
      setCurrent((c) => ({ id: c?.id ?? "", name: c?.name ?? DEFAULT_NAME, items: [...(c?.items ?? []), temp] }));
      try {
        const inv = await ensureInvestment();
        const item = await addPick(inv.id, { propertyId });
        markInversionesChanged();
        setCurrent((c) => {
          if (!c) return c;
          const items = c.items.some((i) => i.id === item.id)
            ? c.items.filter((i) => i.id !== temp.id)
            : c.items.map((i) => (i.id === temp.id ? { ...i, id: item.id } : i));
          return { id: inv.id, name: inv.name, items };
        });
        show(`Agregado a ${inv.name}`);
      } catch {
        setCurrent((c) => {
          if (!c) return c;
          const items = c.items.filter((i) => i.id !== temp.id);
          return !target.current && items.length === 0 ? null : { ...c, items };
        });
        show("No se pudo guardar.");
      }
    },
    [ensureInvestment, show],
  );

  const remove = useCallback(
    async (item: InicioItem) => {
      setCurrent((c) => (c ? { ...c, items: c.items.filter((i) => i.id !== item.id) } : c));
      try {
        await removePick(item.id);
        markInversionesChanged();
      } catch {
        setCurrent((c) => (c && !c.items.some((i) => i.id === item.id) ? { ...c, items: [...c.items, item] } : c));
        show("No se pudo guardar.");
      }
    },
    [show],
  );

  const toggle = useCallback(
    (t: { propertyId: string | null; imageUrl: string | null }) => {
      if (!t.propertyId) return;
      const existing = current?.items.find((i) => i.propertyId === t.propertyId);
      if (existing) {
        // A pick still being saved is never removed by a second click.
        if (!existing.id.startsWith(TEMP)) void remove(existing);
        return;
      }
      void add(t.propertyId, t.imageUrl);
    },
    [current, add, remove],
  );

  const value = useMemo<Ctx>(
    () => ({
      current,
      others,
      isAdded: (propertyId) => !!propertyId && !!current?.items.some((i) => i.propertyId === propertyId),
      toggle,
    }),
    [current, others, toggle],
  );

  return (
    <InicioContext.Provider value={value}>
      {children}
      <p
        role="status"
        className={`fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground shadow-lg sm:left-auto sm:right-6 sm:bottom-6 sm:w-72 ${notice ? "" : "hidden"}`}
      >
        {notice}
      </p>
    </InicioContext.Provider>
  );
}
