"use client";

import { useSyncExternalStore } from "react";
import { ASSUMPTIONS_COOKIE } from "@/lib/assumptions-cookie";

export const ASSUMPTIONS_CHANGED_EVENT = "dptos:assumptions-changed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ASSUMPTIONS_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(ASSUMPTIONS_CHANGED_EVENT, onChange);
}

function readCookie(): string {
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${ASSUMPTIONS_COOKIE}=`));
  return match ? match.slice(ASSUMPTIONS_COOKIE.length + 1) : "";
}

/** The raw assumptions cookie value; changes whenever the settings window saves. */
export function useAssumptionsVersion(): string {
  return useSyncExternalStore(subscribe, readCookie, () => "");
}
