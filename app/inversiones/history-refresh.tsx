"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Back and Forward restore a page from the client router cache, with the picks and counts it
 * had when it was first shown. The actions do not revalidate (that would re-render the current
 * workspace on every click), so after a change in this tab, a history move refreshes the page
 * it lands on. Without a change, history moves stay instant.
 */
let changed = false;

export function markInversionesChanged(): void {
  changed = true;
}

export function HistoryRefresh() {
  const router = useRouter();
  useEffect(() => {
    const onPop = () => {
      // Let the router finish restoring the entry, then refresh that entry.
      if (changed) window.setTimeout(() => router.refresh(), 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [router]);
  return null;
}
