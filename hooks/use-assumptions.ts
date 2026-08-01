/**
 * Assumptions panel state: URL first, then localStorage, then defaults.
 *
 * URL wins so a scenario is linkable and two tabs can hold two different ones.
 * localStorage remembers the last scenario across visits. Defaults are last so a
 * fresh visitor gets the optimistic-but-documented starting point.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_PANEL,
  type PanelAssumptions,
} from "@/lib/assumption-defaults";
import { assumptionWarnings, type AssumptionWarning } from "@/lib/finance";

const STORAGE_KEY = "dptos-assumptions";

const PARAMS = {
  downPaymentPct: "inicial",
  tea: "tea",
  tcea: "tcea",
  termYears: "plazo",
} as const;

function parseNumber(raw: string | null, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function fromSearchParams(params: URLSearchParams): PanelAssumptions | null {
  const hasAny = Object.values(PARAMS).some((key) => params.has(key));
  if (!hasAny) return null;
  return {
    downPaymentPct: parseNumber(params.get(PARAMS.downPaymentPct), DEFAULT_PANEL.downPaymentPct),
    tea: parseNumber(params.get(PARAMS.tea), DEFAULT_PANEL.tea),
    tcea: parseNumber(params.get(PARAMS.tcea), DEFAULT_PANEL.tcea),
    termYears: Math.round(parseNumber(params.get(PARAMS.termYears), DEFAULT_PANEL.termYears)),
  };
}

function fromStorage(): PanelAssumptions | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelAssumptions>;
    return {
      downPaymentPct: Number(parsed.downPaymentPct) || DEFAULT_PANEL.downPaymentPct,
      tea: Number(parsed.tea) || DEFAULT_PANEL.tea,
      tcea: Number(parsed.tcea) || DEFAULT_PANEL.tcea,
      termYears: Math.round(Number(parsed.termYears) || DEFAULT_PANEL.termYears),
    };
  } catch {
    return null;
  }
}

function toQuery(panel: PanelAssumptions): Record<string, string> {
  return {
    [PARAMS.downPaymentPct]: String(panel.downPaymentPct),
    [PARAMS.tea]: String(panel.tea),
    [PARAMS.tcea]: String(panel.tcea),
    [PARAMS.termYears]: String(panel.termYears),
  };
}

export interface UseAssumptionsResult {
  panel: PanelAssumptions;
  setPanel: (next: PanelAssumptions | ((prev: PanelAssumptions) => PanelAssumptions)) => void;
  setField: <K extends keyof PanelAssumptions>(key: K, value: PanelAssumptions[K]) => void;
  reset: () => void;
  warnings: AssumptionWarning[];
  ready: boolean;
}

export function useAssumptions(): UseAssumptionsResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [panel, setPanelState] = useState<PanelAssumptions>(DEFAULT_PANEL);
  const [ready, setReady] = useState(false);

  // Hydrate once from URL or storage. URL wins so a shared link is not overwritten.
  useEffect(() => {
    const fromUrl = fromSearchParams(new URLSearchParams(searchParams.toString()));
    const fromLs = fromStorage();
    const initial = fromUrl ?? fromLs ?? DEFAULT_PANEL;
    setPanelState(initial);
    setReady(true);

    // Storage (or defaults) should still become a linkable URL on first visit.
    if (!fromUrl) {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(toQuery(initial))) {
        params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
    // Only on mount / when the URL is first available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    (next: PanelAssumptions) => {
      setPanelState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode or full storage: the URL still holds the scenario.
      }

      // Read the live URL so rapid edits do not clobber each other with a stale
      // searchParams closure from the render that scheduled the first write.
      const params = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(toQuery(next))) {
        params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const setPanel = useCallback(
    (next: PanelAssumptions | ((prev: PanelAssumptions) => PanelAssumptions)) => {
      setPanelState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        queueMicrotask(() => persist(value));
        return value;
      });
    },
    [persist]
  );

  const setField = useCallback(
    <K extends keyof PanelAssumptions>(key: K, value: PanelAssumptions[K]) => {
      setPanel((prev) => ({ ...prev, [key]: value }));
    },
    [setPanel]
  );

  const reset = useCallback(() => persist(DEFAULT_PANEL), [persist]);

  const warnings = useMemo(
    () =>
      assumptionWarnings({
        ...panel,
        vacancyMonthsPerYear: 1,
        rentGrowthPct: 3,
        rentIncomeTaxPct: 5,
      }),
    [panel]
  );

  return { panel, setPanel, setField, reset, warnings, ready };
}
