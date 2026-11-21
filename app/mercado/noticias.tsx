"use client";

import { useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import { newsEmptyText, type NewsRow } from "@/lib/news-order";
import { toggleSavedNews } from "./actions";

const DATE = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric" });

/** `items` are the 20 newest, in order; `savedItems` are all the saved ones. */
export function Noticias({ items, savedItems }: { items: NewsRow[]; savedItems: NewsRow[] }) {
  const [tab, setTab] = useState<"todas" | "guardadas">("todas");
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([...items, ...savedItems].map((r) => [r.id, r.saved])),
  );
  const [error, setError] = useState(false);

  const toggle = async (id: string) => {
    const before = saved[id] ?? false;
    setError(false);
    setSaved((s) => ({ ...s, [id]: !before }));
    try {
      const res = await toggleSavedNews(id);
      setSaved((s) => ({ ...s, [id]: res.saved }));
    } catch {
      setSaved((s) => ({ ...s, [id]: before }));
      setError(true);
    }
  };

  // "Guardadas" lists what is saved now, including items saved from "Recientes" in this visit.
  const savedIds = new Set(savedItems.map((r) => r.id));
  const all = new Map([...savedItems, ...items].map((r) => [r.id, r]));
  const shown = tab === "todas" ? items : [...all.values()].filter((r) => saved[r.id] || savedIds.has(r.id));
  const empty = newsEmptyText(tab, shown.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
          {(["todas", "guardadas"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 ${tab === t ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {t === "todas" ? "Recientes" : "Guardadas"}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-loss">
            No se pudo guardar.
          </p>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {shown.map((n) => {
            const on = saved[n.id] ?? false;
            return (
              <li key={n.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-sm font-medium hover:underline">
                    <span>{n.title}</span>
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {n.source} · {DATE.format(new Date(n.publishedAt ?? n.fetchedAt))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggle(n.id)}
                  aria-pressed={on}
                  aria-label={on ? "Quitar de guardadas" : "Guardar noticia"}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <Bookmark className={`size-4 ${on ? "fill-current text-foreground" : ""}`} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
