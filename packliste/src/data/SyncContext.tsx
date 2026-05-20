import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SyncManager, type SyncStatus } from "./SyncManager";
import { useDataProvider, useProviderRevision } from "./DataProviderContext";

interface SyncCtx {
  status: SyncStatus;
  error?: string;
  /** Wenn null, ist Sync nicht aktiv (kein Code gesetzt). */
  code: string | null;
  /** Manuell jetzt pushen — z.B. für "Sofort syncen"-Button. */
  pushNow: () => Promise<void>;
}

const Ctx = createContext<SyncCtx | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const provider = useDataProvider();
  // Re-render wenn syncCode sich ändert (gesetzt via setSyncCode)
  useProviderRevision();
  const code = provider.getSyncCode();

  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [manager, setManager] = useState<SyncManager | null>(null);

  useEffect(() => {
    if (!code) {
      setManager(null);
      setStatus("idle");
      setError(undefined);
      return;
    }
    const m = new SyncManager(provider, code);
    const off = m.onStatusChange((s, err) => {
      setStatus(s);
      setError(err);
    });
    setManager(m);
    return () => {
      off();
      m.dispose();
    };
  }, [code, provider]);

  const value: SyncCtx = {
    status,
    error,
    code,
    pushNow: async () => {
      await manager?.pushNow();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("SyncProvider missing");
  return ctx;
}
