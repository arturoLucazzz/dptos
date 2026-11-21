"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { DistrictMapView as View } from "./district-map-view";

// Client only, so the server bundle and the tests never load maplibre.
const DistrictMapView = dynamic(() => import("./district-map-view").then((m) => m.DistrictMapView), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/40 lg:h-[30rem]" />,
});

export function DistrictMap(props: ComponentProps<typeof View>) {
  return <DistrictMapView {...props} />;
}
