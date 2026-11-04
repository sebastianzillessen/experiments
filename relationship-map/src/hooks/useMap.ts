import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { MapResponse, TimelineResponse } from "../types.ts";

/**
 * Loads the relationship map. When `at` is null the live map is shown; when set
 * to an ISO timestamp the map is reconstructed from the change log at that time.
 */
export function useMap(at: string | null) {
  const [map, setMap] = useState<MapResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);

  const refreshMap = useCallback(async () => {
    setMap(await api.getMap(at));
  }, [at]);

  const refreshTimeline = useCallback(async () => {
    setTimeline(await api.getTimeline());
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([refreshMap(), refreshTimeline()]);
  }, [refreshMap, refreshTimeline]);

  useEffect(() => {
    void refreshMap();
  }, [refreshMap]);

  useEffect(() => {
    void refreshTimeline();
  }, [refreshTimeline]);

  return { map, timeline, refresh, refreshMap };
}
