"use client";

/**
 * Shared maplibre setup for every map in the app: the worker file, the OpenFreeMap styles, and
 * the dark-to-positron fallback. Client only; import it from client components that load
 * maplibre, so the server bundle and the tests never do.
 */

import { useCallback, useRef, useState } from "react";
import { setWorkerUrl } from "maplibre-gl";

// maplibre looks for its worker next to its own file, which the bundler moves. Point it at
// the worker file the bundler emits instead.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

export const MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
export const MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";

/** The dark style, falling back to positron (still OpenFreeMap) when the dark style itself fails to load. */
export function useMapStyle() {
  const [style, setStyle] = useState(MAP_STYLE_DARK);
  const styleSeen = useRef(false);
  const onStyleData = useCallback(() => {
    styleSeen.current = true;
  }, []);
  const onError = useCallback(
    (e: { error?: unknown }) => {
      const url = (e.error as { url?: unknown } | undefined)?.url;
      if (!styleSeen.current && style === MAP_STYLE_DARK && url === MAP_STYLE_DARK) setStyle(MAP_STYLE_LIGHT);
      else console.warn("map error", e.error);
    },
    [style],
  );
  return { style, onStyleData, onError };
}
