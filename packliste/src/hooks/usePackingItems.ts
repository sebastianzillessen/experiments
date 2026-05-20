import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function usePackingItems(familyId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!familyId) return [];
  return provider.listPackingItems(familyId);
}
