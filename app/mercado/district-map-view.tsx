"use client";

/**
 * The /mercado district map: the 43 districts colored by one statistic in five quantile steps.
 * A missing value is gray and reads "sin datos", never the lowest step. Districts with listings
 * have a white outline. Tiles come from OpenFreeMap only (see app/map-setup.ts).
 */

import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import Map, { Layer, NavigationControl, Popup, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { ExpressionSpecification, GeoJSONSourceSpecification } from "maplibre-gl";
import { MAP_STYLE_DARK, useMapStyle } from "@/app/map-setup";
import {
  formatMetricValue,
  metricScale,
  type DistrictProps,
  type FeatureCollection,
  type MapMetric,
  type MapMetricKey,
} from "@/lib/district-map";

type Districts = FeatureCollection<{ type: "MultiPolygon"; coordinates: [number, number][][][] }, DistrictProps>;

// One hue, dark to light: on a dark surface more of the statistic reads as brighter.
const RAMP = ["#1d3557", "#2a5a8f", "#3d82c4", "#6aa9e6", "#a9d0f7"];
const NO_DATA = "#3b4048";
const OUTLINE = "#ffffff";
const LIMA_VIEW = { longitude: -77.03, latitude: -12.05, zoom: 9.6 };

/** The ramp colors for n steps, spread so the lightest is always reached. */
function steps(n: number): string[] {
  return Array.from({ length: n }, (_, i) => RAMP[n === 1 ? 2 : Math.round((i * (RAMP.length - 1)) / (n - 1))]);
}

function fillColor(key: MapMetricKey, breaks: number[]): ExpressionSpecification {
  const colors = steps(breaks.length + 1);
  const byValue: ExpressionSpecification =
    breaks.length === 0
      ? ["literal", colors[0]] as unknown as ExpressionSpecification
      : (["step", ["get", key], colors[0], ...breaks.flatMap((b, i) => [b, colors[i + 1]])] as unknown as ExpressionSpecification);
  return ["case", ["==", ["typeof", ["get", key]], "number"], byValue, NO_DATA];
}

const num = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });

export function DistrictMapView({ districts, metrics }: { districts: Districts; metrics: MapMetric[] }) {
  const { style, onStyleData, onError } = useMapStyle();
  const [key, setKey] = useState<MapMetricKey>(metrics[0].key);
  const [hover, setHover] = useState<{ props: DistrictProps; lng: number; lat: number } | null>(null);

  const metric = metrics.find((m) => m.key === key) ?? metrics[0];
  const breaks = useMemo(() => metricScale(districts.features.map((f) => f.properties[key]), 5), [districts, key]);
  const colors = steps(breaks.length + 1);
  const paint = useMemo(() => fillColor(key, breaks), [key, breaks]);

  const onMove = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    setHover(f ? { props: f.properties as DistrictProps, lng: e.lngLat.lng, lat: e.lngLat.lat } : null);
  };

  const legend = colors.map((color, i) => {
    const lo = i === 0 ? null : breaks[i - 1];
    const hi = i === breaks.length ? null : breaks[i];
    const label = lo === null ? `Menos de ${num(hi as number)}` : hi === null ? `${num(lo)} o más` : `${num(lo)} a ${num(hi)}`;
    return { color, label };
  });
  const sourceLine = metric.source ? `${metric.source}${metric.period ? `, ${metric.period}` : ""}` : "fuente sin cargar";

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Qué pintar en el mapa" className="flex flex-wrap gap-2">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={m.key === key}
            onClick={() => {
              setKey(m.key);
              setHover(null);
            }}
            className={`rounded-md border px-3 py-1 text-xs ${
              m.key === key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div
        className="h-80 overflow-hidden rounded-xl border border-border lg:h-[30rem]"
        data-map-style={style === MAP_STYLE_DARK ? "dark" : "positron"}
        data-metric={key}
      >
        <Map
          initialViewState={LIMA_VIEW}
          mapStyle={style}
          style={{ width: "100%", height: "100%" }}
          interactiveLayerIds={["districts-fill"]}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={onMove}
          attributionControl={{ compact: true }}
          onStyleData={onStyleData}
          onError={onError}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <Source id="districts" type="geojson" data={districts as unknown as GeoJSONSourceSpecification["data"]}>
            <Layer id="districts-fill" type="fill" paint={{ "fill-color": paint, "fill-opacity": 0.85 }} />
            <Layer id="districts-line" type="line" paint={{ "line-color": "#0b0d11", "line-width": 0.6, "line-opacity": 0.8 }} />
            <Layer id="districts-tracked" type="line" filter={["==", ["get", "tracked"], true]} paint={{ "line-color": OUTLINE, "line-width": 1.6 }} />
          </Source>
          {hover && (
            <Popup longitude={hover.lng} latitude={hover.lat} offset={12} closeButton={false} closeOnClick={false} maxWidth="none" className="dptos-map-popup">
              <div className="w-56 space-y-0.5 rounded-lg border border-border bg-card p-2.5 text-xs text-card-foreground">
                <p className="text-sm font-semibold">{hover.props.name}</p>
                <p className={hover.props[key] === null ? "text-muted-foreground" : "font-medium"}>{formatMetricValue(hover.props[key], metric.unit)}</p>
                {key === "zone_household_income_pen" && hover.props.zone && <p className="text-muted-foreground">Zona: {hover.props.zone}</p>}
                <p className="text-muted-foreground">Fuente: {sourceLine}</p>
                {hover.props.tracked && <p className="text-muted-foreground">Con avisos en dptos</p>}
              </div>
            </Popup>
          )}
        </Map>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Leyenda">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: NO_DATA }} />
            sin datos
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border-2 border-white" />
            con avisos en dptos
          </li>
        </ul>
        <p>
          {metric.label}
          {metric.unit ? ` (${metric.unit})` : ""}. Fuente: {sourceLine}. Los cortes dividen los distritos con dato en cinco grupos parejos.
        </p>
      </div>
    </div>
  );
}
