import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function useTripItems(tripId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!tripId) return [];
  return provider.listTripItems(tripId);
}
