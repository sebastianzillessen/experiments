import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function useTrips(familyId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!familyId) return [];
  return provider.listTrips(familyId);
}

export function useTrip(tripId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!tripId) return null;
  return provider.getTrip(tripId);
}
