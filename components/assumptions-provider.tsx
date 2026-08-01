"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAssumptions, type UseAssumptionsResult } from "@/hooks/use-assumptions";

const AssumptionsContext = createContext<UseAssumptionsResult | null>(null);

export function AssumptionsProvider({ children }: { children: ReactNode }) {
  const value = useAssumptions();
  return <AssumptionsContext.Provider value={value}>{children}</AssumptionsContext.Provider>;
}

export function useAssumptionsContext(): UseAssumptionsResult {
  const ctx = useContext(AssumptionsContext);
  if (!ctx) {
    throw new Error("useAssumptionsContext must be used inside AssumptionsProvider");
  }
  return ctx;
}
