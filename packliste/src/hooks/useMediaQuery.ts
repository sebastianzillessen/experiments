import { useEffect, useState } from "react";

/**
 * Reagiert auf eine CSS-Media-Query und liefert bool. Wird genutzt, um auf
 * großen Screens ein anderes Layout (Desktop-Board) zu rendern statt es
 * nur per CSS ein-/auszublenden — so läuft nicht beides gleichzeitig
 * (doppelte DnD-Kontexte etc.).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
