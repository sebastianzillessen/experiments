import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function usePersons(familyId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!familyId) return [];
  return provider.listPersons(familyId);
}
