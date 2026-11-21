"use client";

/**
 * The workspace map: every pin for the filters in one clustered GeoJSON source, a popup with
 * the card summary, the saved zones as outlines, and a drawn area that filters the cards.
 *
 * Client only: workspace.tsx loads it with next/dynamic and ssr false, so the server bundle
 * and the tests never import maplibre. Tiles come from OpenFreeMap only.
 */

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, NavigationControl, Popup, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import { MAP_STYLE_DARK, useMapStyle } from "@/app/map-setup";
import { CardPhoto, pen } from "@/components/listing-card";
import { markInversionesChanged } from "@/app/inversiones/history-refresh";
import { moneyLine } from "@/lib/home";
import type { InvestmentFilters } from "@/lib/investments/filters";
import {
  closeHitRadiusPx,
  draftTap,
  pointsToFeatures,
  undoLastPoint,
  zoneOutlines,
  type MapPoint,
  type ZoneOutlineInput,
} from "@/lib/investments/map-features";
import type { CardRow } from "@/lib/investments/workspace-data";
import type { Ring } from "@/lib/location/geo";
import { POLYGON_MAX_POINTS, validatePolygon } from "@/lib/location/polygon-input";

const LIMA_VIEW = { longitude: -77.03, latitude: -12.1, zoom: 11 };
// Theme tokens from app/globals.css; the map paints with plain colors, not CSS variables.
const GAIN = "#34d399";
const LOSS = "#fb7185";
const NEUTRAL = "#939aa6";
const PRIMARY = "#10b981";

type Selected = { id: string; lon: number; lat: number };
type Lookup = { id: string; state: "loading" | "error" } | { id: string; state: "ready"; card: CardRow | null };

/** The filter fields that change which pins show; sort and order do not. */
function pointsKey(f: InvestmentFilters): string {
  const { sort: _sort, order: _order, ...rest } = f;
  return JSON.stringify(rest);
}

function PopupBody({ card, added, onToggle }: { card: CardRow; added: boolean; onToggle: () => void }) {
  const canAdd = card.type === "project" || card.row.propertyId != null;
  return (
    <div className="w-56 overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
      <CardPhoto src={card.row.imageUrl} className="aspect-[16/9]" />
      <div className="space-y-0.5 p-2.5">
        {card.type === "unit" ? (
          <>
            <p className="text-sm font-semibold">{pen(card.row.pricePen)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {card.row.bedrooms ?? "-"} dorm · {card.row.areaM2 ?? "-"} m² · {card.row.districtName}
            </p>
            {(() => {
              const money = moneyLine(card.row.monthlyGainPen);
              return money && <p className={`text-xs font-medium ${money.tone === "gain" ? "text-gain" : "text-loss"}`}>{money.text}</p>;
            })()}
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">
              {card.row.priceFromPen == null ? "Precio no publicado" : `desde ${pen(card.row.priceFromPen)}`}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {card.row.name} · {card.row.districtName}
            </p>
            {card.row.deliveryDate && <p className="text-xs text-muted-foreground">Entrega {card.row.deliveryDate}</p>}
          </>
        )}
        <div className="flex items-center gap-2 pt-1.5">
          {canAdd && (
            <button
              type="button"
              onClick={onToggle}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                added ? "border border-border hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {added ? "Quitar de la inversión" : "Agregar a la inversión"}
            </button>
          )}
          {card.row.url && (
            <a href={card.row.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              Ver aviso
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveZoneForm({
  ring,
  onSaved,
  onCancel,
  save,
}: {
  ring: Ring;
  onSaved: (zone: ZoneOutlineInput, warning: string | null) => void;
  onCancel: () => void;
  save: (input: { name: string; rating: number; notes: string; ring: Ring }) => Promise<
    { ok: true; zone: ZoneOutlineInput; warning: string | null } | { ok: false; errors: Record<string, string> }
  >;
}) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrors({});
    try {
      const result = await save({ name, rating: rating.trim() === "" ? Number.NaN : Number(rating), notes, ring });
      if (result.ok) onSaved(result.zone, result.warning);
      else setErrors(result.errors);
    } catch {
      setErrors({ form: "No se pudo guardar." });
    } finally {
      setPending(false);
    }
  };

  const error = (key: string) => errors[key] && <span className="block text-xs text-loss">{errors[key]}</span>;
  const input = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-[1fr_6rem_1.5fr_auto] sm:items-end">
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">Nombre</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cerca al parque" autoFocus />
        {error("name")}
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">Nota (0 a 10)</span>
        <input className={input} type="number" min={0} max={10} step={1} inputMode="numeric" value={rating} onChange={(e) => setRating(e.target.value)} />
        {error("rating")}
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">Comentario</span>
        <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Calles tranquilas" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} className="h-8 rounded-md border border-border px-3 text-xs hover:bg-accent">
          Cancelar
        </button>
      </div>
      {(errors.ring || errors.form) && <p className="text-xs text-loss sm:col-span-4">{errors.ring ?? errors.form}</p>}
    </form>
  );
}

export function WorkspaceMap({
  investmentId,
  filters,
  refreshToken,
  zones,
  cardFor,
  isAdded,
  onToggle,
  onAreaChange,
  onZoneSaved,
  saveZone,
  toolbarStart,
}: {
  /** Shown first in the toolbar row: the workspace's fold button. */
  toolbarStart?: React.ReactNode;
  investmentId: string;
  filters: InvestmentFilters;
  /** Bumped by the workspace when the pins must be read again with the same filters. */
  refreshToken: number;
  /** Saved zones; the workspace holds them so a fold and unfold keeps a zone saved here. */
  zones: ZoneOutlineInput[];
  /** The card for a pin: from the loaded rows, or from the cards route. */
  cardFor: (pinId: string) => Promise<CardRow | null>;
  isAdded: (card: CardRow) => boolean;
  onToggle: (card: CardRow) => void;
  onAreaChange: (area: Ring | null) => void;
  onZoneSaved: (zone: ZoneOutlineInput) => void;
  saveZone: React.ComponentProps<typeof SaveZoneForm>["save"];
}) {
  const mapRef = useRef<MapRef>(null);
  const { style, onStyleData, onError } = useMapStyle();
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [pointsFailed, setPointsFailed] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localToken, setLocalToken] = useState(0);

  const key = pointsKey(filters);

  // The pins follow the filters; a newer request makes an older answer drop.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/inversiones/${investmentId}/points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters: JSON.parse(key) }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { points: MapPoint[] };
        setPoints(data.points);
        setPointsFailed(false);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn("map points failed", error);
          setPointsFailed(true);
        }
      });
    return () => controller.abort();
  }, [investmentId, key, refreshToken, localToken]);

  // Escape cancels a drawing in progress.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawing(false);
        setDraft([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing]);

  const pointData = useMemo(() => pointsToFeatures(points), [points]);
  const zoneData = useMemo(() => zoneOutlines(zones), [zones]);
  const areaData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: filters.area ? [{ type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [filters.area] }, properties: {} }] : [],
    }),
    [filters.area]
  );
  const draftData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        ...(draft.length >= 2 ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: draft }, properties: { first: 0 } }] : []),
        ...draft.map((p, i) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: p }, properties: { first: i === 0 ? 1 : 0 } })),
      ],
    }),
    [draft]
  );

  const open = (pin: Selected) => {
    setSelected(pin);
    setLookup({ id: pin.id, state: "loading" });
    cardFor(pin.id)
      .then((card) => setLookup((cur) => (cur?.id === pin.id ? { id: pin.id, state: "ready", card } : cur)))
      .catch(() => setLookup((cur) => (cur?.id === pin.id ? { id: pin.id, state: "error" } : cur)));
  };

  const finishDrawing = (pointsDrawn: [number, number][]) => {
    const checked = validatePolygon(pointsDrawn);
    setDrawing(false);
    setDraft([]);
    if (!checked.ok) {
      setDrawError(checked.error);
      return;
    }
    setDrawError(null);
    onAreaChange(checked.ring);
  };

  const onClick = (e: MapLayerMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;
    if (drawing) {
      const clicked: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      // A fingertip lands less exactly than a mouse, so a touch screen gets a wider target.
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const action = draftTap({
        count: draft.length,
        firstPx: draft.length > 0 ? map.project(draft[0]) : null,
        tapPx: e.point,
        radiusPx: closeHitRadiusPx(coarse),
        max: POLYGON_MAX_POINTS,
      });
      if (action === "close") finishDrawing(draft);
      else if (action === "full") setDrawError(`Usa como máximo ${POLYGON_MAX_POINTS} puntos. Toca "Cerrar zona".`);
      else setDraft((list) => [...list, clicked]);
      return;
    }
    const feature = e.features?.[0];
    if (!feature || feature.geometry.type !== "Point") return;
    const [lon, lat] = feature.geometry.coordinates as [number, number];
    const props = feature.properties as { cluster?: boolean; cluster_id?: number; id?: string };
    if (props.cluster && props.cluster_id != null) {
      const source = map.getSource("points") as GeoJSONSource | undefined;
      void source
        ?.getClusterExpansionZoom(props.cluster_id)
        .then((zoom) => map.easeTo({ center: [lon, lat], zoom }))
        .catch(() => undefined);
      return;
    }
    if (props.id) open({ id: props.id, lon, lat });
  };

  const startDrawing = () => {
    setSelected(null);
    setLookup(null);
    setDrawError(null);
    setMessage(null);
    setSaving(false);
    setDraft([]);
    setDrawing(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {toolbarStart}
        {drawing ? (
          <>
            <span className="text-xs text-muted-foreground">
              Toca el mapa para poner puntos. Cierra con el primer punto o con «Cerrar zona». Esc cancela.
            </span>
            {draft.length >= 3 && (
              <button
                type="button"
                onClick={() => finishDrawing(draft)}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Cerrar zona
              </button>
            )}
            {draft.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDrawError(null);
                  setDraft((list) => undoLastPoint(list));
                }}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                Deshacer punto
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDrawing(false);
                setDraft([]);
              }}
              className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" onClick={startDrawing} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent">
            Dibujar zona
          </button>
        )}
        {filters.area && !drawing && (
          <>
            <button
              type="button"
              onClick={() => {
                setSaving(false);
                onAreaChange(null);
              }}
              className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
            >
              Quitar zona
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setSaving(true);
              }}
              className="rounded-md border border-primary/60 px-3 py-1 text-xs text-primary hover:bg-primary/10"
            >
              Guardar zona
            </button>
          </>
        )}
        {drawError && <span className="text-xs text-loss">{drawError}</span>}
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
        {pointsFailed && <span className="text-xs text-loss">No se pudieron cargar los puntos del mapa.</span>}
      </div>

      {saving && filters.area && (
        <SaveZoneForm
          ring={filters.area}
          save={saveZone}
          onCancel={() => setSaving(false)}
          onSaved={(zone, warning) => {
            setSaving(false);
            // A new zone changes /zonas and the location scores: Back must not restore a stale page.
            markInversionesChanged();
            setMessage(warning ??`Zona "${zone.name}" guardada. Los puntajes ya se recalcularon.`);
            setLocalToken((n) => n + 1);
            onZoneSaved(zone);
          }}
        />
      )}

      <div className="h-80 overflow-hidden rounded-xl border border-border lg:h-[30rem]" data-map-style={style === MAP_STYLE_DARK ? "dark" : "positron"}>
        <Map
          ref={mapRef}
          initialViewState={LIMA_VIEW}
          mapStyle={style}
          style={{ width: "100%", height: "100%" }}
          interactiveLayerIds={drawing ? [] : ["clusters", "point"]}
          cursor={drawing ? "crosshair" : undefined}
          doubleClickZoom={!drawing}
          onClick={onClick}
          attributionControl={{ compact: true }}
          onStyleData={onStyleData}
          onError={onError}
        >
          <NavigationControl position="top-right" showCompass={false} />

          <Source id="zones" type="geojson" data={zoneData}>
            <Layer id="zones-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.06 }} />
            <Layer id="zones-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.9 }} />
          </Source>

          <Source id="area" type="geojson" data={areaData}>
            <Layer id="area-fill" type="fill" paint={{ "fill-color": PRIMARY, "fill-opacity": 0.08 }} />
            <Layer id="area-line" type="line" paint={{ "line-color": PRIMARY, "line-width": 2, "line-dasharray": [2, 1] }} />
          </Source>

          <Source id="points" type="geojson" data={pointData} cluster clusterRadius={45} clusterMaxZoom={15}>
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": "#1f2937",
                "circle-stroke-color": PRIMARY,
                "circle-stroke-width": 1.5,
                "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 23, 500, 28],
              }}
            />
            <Layer
              id="cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{ "text-field": "{point_count_abbreviated}", "text-font": ["Noto Sans Regular"], "text-size": 12, "text-allow-overlap": true }}
              paint={{ "text-color": "#e5e7eb" }}
            />
            <Layer
              id="point"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": ["case", ["==", ["typeof", ["get", "gain"]], "number"], ["case", [">=", ["get", "gain"], 0], GAIN, LOSS], NEUTRAL],
                "circle-radius": 6,
                "circle-stroke-color": "#0b0d10",
                "circle-stroke-width": 1.5,
              }}
            />
          </Source>

          <Source id="draft" type="geojson" data={draftData}>
            <Layer id="draft-line" type="line" filter={["==", ["geometry-type"], "LineString"]} paint={{ "line-color": PRIMARY, "line-width": 2 }} />
            <Layer
              id="draft-points"
              type="circle"
              filter={["==", ["geometry-type"], "Point"]}
              paint={{
                "circle-color": PRIMARY,
                "circle-radius": ["case", ["==", ["get", "first"], 1], 7, 4],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.5,
              }}
            />
          </Source>

          {selected && lookup?.id === selected.id && (
            <Popup
              longitude={selected.lon}
              latitude={selected.lat}
              offset={10}
              maxWidth="none"
              className="dptos-map-popup"
              onClose={() => {
                setSelected(null);
                setLookup(null);
              }}
            >
              {lookup.state === "loading" && <p className="rounded-lg bg-card p-3 text-xs text-muted-foreground">Cargando…</p>}
              {lookup.state === "error" && <p className="rounded-lg bg-card p-3 text-xs text-loss">No se pudo cargar.</p>}
              {lookup.state === "ready" &&
                (lookup.card ? (
                  <PopupBody card={lookup.card} added={isAdded(lookup.card)} onToggle={() => onToggle(lookup.card!)} />
                ) : (
                  <p className="rounded-lg bg-card p-3 text-xs text-muted-foreground">Ya no está publicado.</p>
                ))}
            </Popup>
          )}
        </Map>
      </div>
    </div>
  );
}
