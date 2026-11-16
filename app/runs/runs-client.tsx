"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunSourceSection } from "@/lib/run-sources";
import { SOURCE_LABELS } from "@/lib/listing-card";

export interface RunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  mode: string;
  status: string;
  gitSha: string | null;
  pagesFetched: number;
  skippedDistricts: string[];
  errors: unknown;
  notes: string | null;
  sale: number;
  rent: number;
  sources: RunSourceSection[];
  durationMs: number | null;
}

function isThin(d: { sale: number; rent: number }): boolean {
  return (d.sale > 0 && d.sale < 50) || (d.rent > 0 && d.rent < 20);
}

function statusTone(status: string): string {
  switch (status) {
    case "SUCCESS":
      return "bg-emerald-100 text-emerald-800";
    case "PARTIAL":
      return "bg-amber-100 text-amber-900";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "RUNNING":
      return "bg-sky-100 text-sky-800";
    default:
      return "";
  }
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function RunsClient({ runs }: { runs: RunRow[] }) {
  const [openId, setOpenId] = useState<string | null>(runs[0]?.id ?? null);

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay corridas. Ejecuta <code className="rounded bg-muted px-1">pnpm scrape</code>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const open = openId === run.id;
        return (
          <Card key={run.id}>
            <CardHeader className="cursor-pointer py-3" onClick={() => setOpenId(open ? null : run.id)}>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="text-base font-medium">
                  {new Date(run.startedAt).toLocaleString("es-PE")}
                </CardTitle>
                <Badge className={statusTone(run.status)}>{run.status}</Badge>
                <span className="text-sm text-muted-foreground">{run.mode}</span>
                <span className="text-sm text-muted-foreground">{formatDuration(run.durationMs)}</span>
                <span className="text-sm text-muted-foreground">
                  {run.sale.toLocaleString("es-PE")} venta · {run.rent.toLocaleString("es-PE")} alquiler
                </span>
                {run.gitSha && (
                  <span className="font-mono text-xs text-muted-foreground">{run.gitSha.slice(0, 7)}</span>
                )}
                {run.skippedDistricts.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-900">
                    sanity gate: {run.skippedDistricts.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            {open && (
              <CardContent className="space-y-4 border-t pt-4 text-sm">
                {run.notes && <p className="text-muted-foreground">{run.notes}</p>}
                {run.sources.map((source) => {
                  const suspicious = source.districts.filter(isThin);
                  return (
                    <section key={source.id} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{SOURCE_LABELS[source.id]}</h3>
                        <span className="text-muted-foreground">
                          {source.sale.toLocaleString("es-PE")} venta · {source.rent.toLocaleString("es-PE")} alquiler
                        </span>
                        {!source.recorded && (
                          <Badge className="bg-amber-100 text-amber-900">no registrada en esta corrida</Badge>
                        )}
                      </div>
                      {source.districts.length === 0 ? (
                        <p className="text-muted-foreground">Sin conteos.</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {source.districts.map((d) => (
                            <div
                              key={d.slug}
                              className={
                                isThin(d)
                                  ? "rounded border border-amber-300 bg-amber-50 px-3 py-2"
                                  : "rounded border px-3 py-2"
                              }
                            >
                              <div className="font-medium">{d.slug}</div>
                              <div className="text-muted-foreground">
                                venta {d.sale} · alquiler {d.rent}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {suspicious.length > 0 && (
                        <p className="text-amber-800">
                          Distritos con conteos bajos (revisar): {suspicious.map((d) => d.slug).join(", ")}
                        </p>
                      )}
                    </section>
                  );
                })}
                {run.skippedDistricts.length > 0 && (
                  <p>
                    Compuerta de sanidad: no se tocó <code>lastSeenAt</code> en{" "}
                    {run.skippedDistricts.join(", ")}.
                  </p>
                )}
                {run.errors != null && (
                  <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                    {typeof run.errors === "string"
                      ? run.errors
                      : JSON.stringify(run.errors, null, 2)}
                  </pre>
                )}
                <p className="text-xs text-muted-foreground">
                  {run.pagesFetched} páginas · id {run.id}
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
