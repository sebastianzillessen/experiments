import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DataProvider } from "./DataProvider";

const DataProviderCtx = createContext<DataProvider | null>(null);

interface ProviderProps {
  provider: DataProvider;
  children: ReactNode;
}

export function DataProviderRoot({ provider, children }: ProviderProps) {
  return <DataProviderCtx.Provider value={provider}>{children}</DataProviderCtx.Provider>;
}

export function useDataProvider(): DataProvider {
  const p = useContext(DataProviderCtx);
  if (!p) throw new Error("DataProvider missing");
  return p;
}

/**
 * Force re-renders when the provider notifies. Use in components that depend
 * on any storage data (the granularity is coarse — the entire subtree
 * re-renders on any change — which is fine for a single-user local app).
 */
export function useProviderRevision(): number {
  const provider = useDataProvider();
  const [rev, setRev] = useState(0);
  useEffect(() => provider.subscribe(() => setRev((r) => r + 1)), [provider]);
  return rev;
}
