import { useEffect, useRef } from "react";
import { useDataProvider } from "../data/DataProviderContext";

const PUSH_DEBOUNCE_MS = 2000;

/**
 * Hält aktive Nur-Lese-Trip-Shares aktuell: bei jeder lokalen Mutation
 * werden (debounced) alle geteilten Trips erneut zum Worker gepusht, damit
 * Betrachter des Links den aktuellen Pack-Stand sehen. Rendert nichts.
 *
 * Fehler werden bewusst geschluckt — der nächste Edit (oder das nächste
 * Öffnen des Share-Dialogs) versucht es erneut, und der Link läuft
 * schlimmstenfalls nach 30 Tagen ab.
 */
export function TripShareRunner() {
  const provider = useDataProvider();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    const pushAll = async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        for (const tripId of Object.keys(provider.listTripShares())) {
          await provider.pushTripShareUpdate(tripId).catch(() => false);
        }
      } finally {
        inflight.current = false;
      }
    };

    const unsub = provider.subscribe(() => {
      if (Object.keys(provider.listTripShares()).length === 0) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void pushAll();
      }, PUSH_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [provider]);

  return null;
}
