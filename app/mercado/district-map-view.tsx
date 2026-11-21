"use client";

/**
 * The /mercado district map: the 43 districts colored by one statistic in five quantile steps.
 * A missing value is gray and reads "sin datos", never the lowest step. Districts with listings
 * have a white outline. Tiles come from OpenFreeMap only (see app/map-setup.ts).
 */

import "maplibre-gl/dist/maplibre-gl.css";
import { RAMP } from "@/lib/map-ramp";
import { useMemo, useState } from "react";
import { MAP_LOCALE } from "@/lib/map-locale";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
} from "maplibre-gl";
import { MAP_STYLE_DARK, useMapStyle } from "@/app/map-setup";
import type { ConstructionPipeline } from "@/lib/analytics";
import { constructionFor, districtPanel } from "@/lib/district-panel";
import type { DistrictMarket } from "@/lib/market-dashboard";
import type { StratumRange } from "@/lib/stats/strata";
import { DistrictPanel } from "./district-panel";
import {
  legendClasses,
  trackedBounds,
  type DistrictProps,
  type FeatureCollection,
  type MapMetric,
  type MapMetricKey,
} from "@/lib/district-map";

type Districts = FeatureCollection<
  { type: "MultiPolygon"; coordinates: [number, number][][][] },
  DistrictProps
>;

// One hue, dark to light: on a dark surface more of the statistic reads as brighter.
const NO_DATA = "#3b4048";
const OUTLINE = "#ffffff";
const LIMA_VIEW = { longitude: -77.03, latitude: -12.05, zoom: 9.6 };

/** The ramp colors for n steps, spread so the lightest is always reached. */
function steps(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => RAMP[n === 1 ? 2 : Math.round((i * (RAMP.length - 1)) / (n - 1))],
  );
}

function fillColor(
  key: MapMetricKey,
  breaks: number[],
  classCount: number,
): ExpressionSpecification {
  if (classCount === 0)
    return ["literal", NO_DATA] as unknown as ExpressionSpecification;
  const colors = steps(classCount);
  const byValue = (breaks.length === 0
    ? ["literal", colors[0]]
    : [
        "step",
        ["get", key],
        colors[0],
        ...breaks.flatMap((b, i) => [b, colors[i + 1]]),
      ]) as unknown as ExpressionSpecification;
  return ["case", ["==", ["typeof", ["get", key]], "number"], byValue, NO_DATA];
}

/** MapLibre may hand back a null property as null, undefined, or a string: only a number is a value. */
const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function DistrictMapView({
  districts,
  metrics,
  market,
  construction,
  strataRanges,
}: {
  districts: Districts;
  metrics: MapMetric[];
  market: DistrictMarket[];
  construction: ConstructionPipeline[];
  strataRanges: StratumRange[];
}) {
  const { style, onStyleData, onError } = useMapStyle();
  const [key, setKey] = useState<MapMetricKey>(metrics[0].key);
  // The district under the mouse (or the last one tapped). Leaving the map keeps it, so the panel never flickers.
  const [selected, setSelected] = useState<string | null>(null);

  const metric = metrics.find((m) => m.key === key) ?? metrics[0];
  const { breaks, classes } = useMemo(
    () =>
      legendClasses(
        districts.features.map((f) => asNumber(f.properties[key])),
        5,
      ),
    [districts, key],
  );
  const colors = steps(classes.length);
  const paint = useMemo(
    () => fillColor(key, breaks, classes.length),
    [key, breaks, classes.length],
  );
  const bounds = useMemo(() => trackedBounds(districts), [districts]);

  const onMove = (e: MapLayerMouseEvent) => {
    const slug = (e.features?.[0]?.properties as DistrictProps | undefined)
      ?.slug;
    if (slug) setSelected(slug);
  };
  // Read the district from our own data, not from MapLibre, which may turn a null property into a string.
  const panel = useMemo(() => {
    const props = districts.features.find(
      (f) => f.properties.slug === selected,
    )?.properties;
    if (!props) return null;
    return districtPanel(
      props,
      market.find((m) => m.slug === props.slug),
      constructionFor(props.slug, construction),
      strataRanges,
    );
  }, [districts, selected, market, construction, strataRanges]);

  const legend = classes.map((c, i) => ({ color: colors[i], label: c.label }));
  const sourceLine = metric.source
    ? `${metric.source}${metric.period ? `, ${metric.period}` : ""}`
    : "fuente sin cargar";

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Qué pintar en el mapa"
        className="flex flex-wrap gap-2"
      >
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={m.key === key}
            onClick={() => setKey(m.key)}
            className={`rounded-md border px-3 py-1 text-xs ${
              m.key === key
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div className="space-y-2">
          <div
            className="h-80 overflow-hidden rounded-xl border border-border lg:h-[30rem]"
            data-map-style={style === MAP_STYLE_DARK ? "dark" : "positron"}
            data-metric={key}
          >
            <Map
              initialViewState={
                bounds
                  ? { bounds, fitBoundsOptions: { padding: 40 } }
                  : LIMA_VIEW
              }
              mapStyle={style}
              locale={MAP_LOCALE}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={["districts-fill"]}
              onMouseMove={onMove}
              onClick={onMove}
              attributionControl={{ compact: true }}
              onStyleData={onStyleData}
              onError={onError}
            >
              <NavigationControl position="top-right" showCompass={false} />
              <Source
                id="districts"
                type="geojson"
                data={
                  districts as unknown as GeoJSONSourceSpecification["data"]
                }
              >
                <Layer
                  id="districts-fill"
                  type="fill"
                  paint={{ "fill-color": paint, "fill-opacity": 0.85 }}
                />
                <Layer
                  id="districts-line"
                  type="line"
                  paint={{
                    "line-color": "#0b0d11",
                    "line-width": 0.6,
                    "line-opacity": 0.8,
                  }}
                />
                <Layer
                  id="districts-tracked"
                  type="line"
                  filter={["==", ["get", "tracked"], true]}
                  paint={{ "line-color": OUTLINE, "line-width": 1.6 }}
                />
              </Source>
            </Map>
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <ul
              className="flex flex-wrap items-center gap-x-4 gap-y-1"
              aria-label="Leyenda"
            >
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-sm"
                    style={{ background: l.color }}
                  />
                  {l.label}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span
                  className="size-3 rounded-sm"
                  style={{ background: NO_DATA }}
                />
                sin datos
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm border-2 border-white" />
                con avisos en dptos
              </li>
            </ul>
            <p>
              {metric.label}
              {metric.unit ? ` (${metric.unit})` : ""}
              {key === "zone_household_income_pen"
                ? " (los distritos de una zona comparten el valor)"
                : ""}
              . Fuente: {sourceLine}.
            </p>
          </div>
        </div>
        <DistrictPanel panel={panel} />
      </div>
    </div>
  );
}
