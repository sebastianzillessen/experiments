import type { DataProvider } from "./DataProvider";

/**
 * Push-on-change (debounced) + Pull-on-open + Polling-Sync gegen den
 * Cloudflare-Worker. "Last-Write-Wins"-Konfliktmodell — wer zuletzt
 * pusht, gewinnt. Für casual Multi-Browser-Setup (eine Familie auf
 * mehreren Geräten) genügt das; echte gleichzeitige Edits können
 * verloren gehen.
 *
 * Lifecycle:
 * - constructor(): Initial-Pull, dann Polling alle 30 s, plus Pull bei
 *   visibilitychange/focus
 * - subscribe(provider): bei lokalen Mutationen 1,5 s debounce, dann Push
 * - dispose(): Listener entfernen, Timer löschen
 */

const PUSH_DEBOUNCE_MS = 1500;
const POLL_INTERVAL_MS = 30_000;

export type SyncStatus = "idle" | "pushing" | "pulling" | "error" | "offline";

export interface SyncListener {
  (status: SyncStatus, error?: string): void;
}

export class SyncManager {
  private code: string;
  private provider: DataProvider;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private unsubProvider: (() => void) | null = null;
  private listeners = new Set<SyncListener>();
  private status: SyncStatus = "idle";
  private statusError: string | undefined;
  private disposed = false;
  /** Aktuelle Push-/Pull-Promise — verhindert überlappende Requests. */
  private inflight: Promise<void> | null = null;

  constructor(provider: DataProvider, code: string) {
    this.code = code;
    this.provider = provider;

    // Bei jeder lokalen Mutation Push planen
    this.unsubProvider = provider.subscribe(() => {
      this.schedulePush();
    });

    // Pull bei Tab-Focus + Visibility
    document.addEventListener("visibilitychange", this.handleVisibility);
    window.addEventListener("focus", this.handleFocus);
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);

    // Polling
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void this.pull();
      }
    }, POLL_INTERVAL_MS);

    // Initial-Pull beim Start (asynchron, sofort)
    void this.pull();

    // Push-on-Page-Hide für letzte Änderungen vor Schließen
    window.addEventListener("pagehide", this.handlePageHide);
  }

  // ---------- Public ----------

  onStatusChange(listener: SyncListener): () => void {
    this.listeners.add(listener);
    // Initial state
    listener(this.status, this.statusError);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.unsubProvider?.();
    document.removeEventListener("visibilitychange", this.handleVisibility);
    window.removeEventListener("focus", this.handleFocus);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("pagehide", this.handlePageHide);
  }

  /** Sofort pushen — wenn lokale Änderungen seit dem letzten Push da sind. */
  async pushNow(): Promise<void> {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    await this.push();
  }

  // ---------- Event-Handler ----------

  private handleVisibility = (): void => {
    if (document.visibilityState === "visible") void this.pull();
  };
  private handleFocus = (): void => {
    void this.pull();
  };
  private handleOnline = (): void => {
    this.setStatus("idle");
    void this.pull();
    void this.push();
  };
  private handleOffline = (): void => {
    this.setStatus("offline");
  };
  private handlePageHide = (): void => {
    // Letzten Stand mitgeben, falls noch nicht gepusht
    const lastChanged = this.provider.getLastChangedAt();
    const lastPushed = this.provider.getLastPushedAt();
    if (lastChanged && (!lastPushed || lastChanged > lastPushed)) {
      const json = this.provider.exportSnapshot();
      try {
        // sendBeacon ist Best-Effort und überlebt unload
        navigator.sendBeacon(
          `/api/packliste/share/${this.code}`,
          new Blob([json], { type: "application/json" }),
        );
      } catch {
        // ignore
      }
    }
  };

  // ---------- Push ----------

  private schedulePush(): void {
    if (this.disposed) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      void this.push();
    }, PUSH_DEBOUNCE_MS);
  }

  private async push(): Promise<void> {
    if (this.disposed) return;
    if (!navigator.onLine) {
      this.setStatus("offline");
      return;
    }
    const lastChanged = this.provider.getLastChangedAt();
    const lastPushed = this.provider.getLastPushedAt();
    if (lastChanged && lastPushed && lastChanged <= lastPushed) {
      // Nichts Neues zu pushen
      return;
    }
    // Serialisieren mit eventuellem laufenden Push/Pull
    if (this.inflight) await this.inflight.catch(() => undefined);
    const work = (async () => {
      this.setStatus("pushing");
      const json = this.provider.exportSnapshot();
      const lastChangedAtSnapshot = this.provider.getLastChangedAt();
      try {
        const res = await fetch(`/api/packliste/share/${this.code}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: json,
        });
        if (!res.ok) {
          const msg = await extractError(res);
          throw new Error(msg);
        }
        if (lastChangedAtSnapshot) this.provider.setLastPushedAt(lastChangedAtSnapshot);
        this.setStatus("idle");
      } catch (e) {
        this.setStatus("error", errMsg(e));
      }
    })();
    this.inflight = work;
    try {
      await work;
    } finally {
      this.inflight = null;
    }
  }

  // ---------- Pull ----------

  private async pull(): Promise<void> {
    if (this.disposed) return;
    if (!navigator.onLine) {
      this.setStatus("offline");
      return;
    }
    if (this.inflight) await this.inflight.catch(() => undefined);
    const work = (async () => {
      this.setStatus("pulling");
      try {
        const res = await fetch(`/api/packliste/share/${this.code}`);
        if (res.status === 404) {
          // Code abgelaufen — Sync auflösen
          throw new Error("Code abgelaufen — bitte neu erzeugen");
        }
        if (!res.ok) throw new Error(await extractError(res));
        const json = await res.text();
        const parsed = JSON.parse(json) as {
          data?: Record<string, unknown>;
        };
        const remoteChangedAt = typeof parsed.data?.["packliste:sync:last-changed-at"] === "string"
          ? (parsed.data["packliste:sync:last-changed-at"] as string)
          : null;
        const localChangedAt = this.provider.getLastChangedAt();
        if (remoteChangedAt && (!localChangedAt || remoteChangedAt > localChangedAt)) {
          // Remote ist neuer → anwenden
          this.provider.applyRemoteSnapshot(json);
        } else {
          // Lokale Daten sind aktueller oder gleich — nur Pull-Timestamp setzen
          this.provider.setLastPulledAt(new Date().toISOString());
        }
        this.setStatus("idle");
      } catch (e) {
        this.setStatus("error", errMsg(e));
      }
    })();
    this.inflight = work;
    try {
      await work;
    } finally {
      this.inflight = null;
    }
  }

  // ---------- Status ----------

  private setStatus(status: SyncStatus, error?: string): void {
    this.status = status;
    this.statusError = error;
    for (const l of this.listeners) l(status, error);
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function extractError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore
  }
  return `HTTP ${res.status}`;
}
