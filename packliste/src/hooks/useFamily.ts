import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function useCurrentFamily() {
  const provider = useDataProvider();
  useProviderRevision();
  return provider.getCurrentFamily();
}

export function useMembers(familyId: string | undefined) {
  const provider = useDataProvider();
  useProviderRevision();
  if (!familyId) return [];
  return provider.listMembers(familyId);
}
