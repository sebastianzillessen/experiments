import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";

export function useCurrentUser() {
  const provider = useDataProvider();
  useProviderRevision();
  return provider.getCurrentUser();
}
