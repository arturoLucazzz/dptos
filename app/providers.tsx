"use client";

import { createContext, useCallback, useContext, useMemo, useOptimistic, useTransition } from "react";
import { setFavorite } from "@/app/actions";

type FavoritesContextValue = {
  favoriteIds: Set<string>;
  toggleFavorite: (propertyId: string) => void;
  isFavorite: (propertyId: string | null | undefined) => boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/**
 * Favorites live on `Property`, not in localStorage.
 *
 * A favorite keyed by posting id vanishes when the broker reposts — which is exactly
 * when you most want to remember you already looked at the apartment. Optimistic
 * updates keep the checkbox snappy; the server action is the source of truth.
 */
export function FavoritesProvider({
  initialFavoriteIds,
  children,
}: {
  initialFavoriteIds: string[];
  children: React.ReactNode;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    new Set(initialFavoriteIds),
    (_current: Set<string>, next: Set<string>) => next
  );
  const [, startTransition] = useTransition();

  const toggleFavorite = useCallback(
    (propertyId: string) => {
      if (!propertyId) return;
      const next = new Set(optimistic);
      const becoming = !next.has(propertyId);
      if (becoming) next.add(propertyId);
      else next.delete(propertyId);

      startTransition(async () => {
        setOptimistic(next);
        await setFavorite(propertyId, becoming);
      });
    },
    [optimistic, setOptimistic]
  );

  const isFavorite = useCallback(
    (propertyId: string | null | undefined) => !!propertyId && optimistic.has(propertyId),
    [optimistic]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ favoriteIds: optimistic, toggleFavorite, isFavorite }),
    [optimistic, toggleFavorite, isFavorite]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
