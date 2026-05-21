import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function useCategories(familyId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!familyId) return [];
  return provider.listCategories(familyId);
}
