import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "favorite-voices";

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

export function useFavoriteVoices() {
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavorites(readFavorites());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites]);

  const isFavorite = useCallback(
    (shortName: string) => favorites.includes(shortName),
    [favorites],
  );

  const toggleFavorite = useCallback((shortName: string) => {
    setFavorites((prev) =>
      prev.includes(shortName)
        ? prev.filter((x) => x !== shortName)
        : [...prev, shortName],
    );
  }, []);

  const removeFavorite = useCallback((shortName: string) => {
    setFavorites((prev) => prev.filter((x) => x !== shortName));
  }, []);

  return { favorites, isFavorite, toggleFavorite, removeFavorite };
}
