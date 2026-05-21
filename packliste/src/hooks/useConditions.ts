import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function useConditions(familyId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!familyId) return [];
  return provider.listConditions(familyId);
}
