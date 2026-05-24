import { styled } from "next-yak";
import { useSync } from "../data/SyncContext";
import { colors } from "../theme.yak";

type Tone = "ok" | "syncing" | "error" | "offline";

const Wrap = styled.div<{ $tone: Tone }>`
  position: fixed;
  right: 14px;
  /* Default: über der mobilen Bottom-Nav + Safe-Area */
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  background: ${({ $tone }) => {
    switch ($tone) {
      case "ok": return colors.successSoft;
      case "syncing": return colors.primarySoft;
      case "offline": return colors.surface2;
      case "error": return colors.dangerSoft;
    }
  }};
  color: ${({ $tone }) => {
    switch ($tone) {
      case "ok": return colors.success;
      case "syncing": return colors.primary;
      case "offline": return colors.ink3;
      case "error": return colors.danger;
    }
  }};
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  z-index: 50;
  pointer-events: none;
  max-width: calc(100% - 28px);
  @media (min-width: 601px) {
    bottom: 14px;
  }
  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: ${({ $tone }) => ($tone === "syncing" ? "pulse 1.2s ease-in-out infinite" : "none")};
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
`;

export function SyncIndicator() {
  const sync = useSync();

  let tone: Tone;
  let text: string;
  if (!sync.code) {
    // Kein Sync aktiv — alte "Lokal gespeichert"-Anzeige
    tone = "ok";
    text = "Lokal gespeichert";
  } else if (sync.status === "offline") {
    tone = "offline";
    text = `Offline · Code ${sync.code}`;
  } else if (sync.status === "pulling") {
    tone = "syncing";
    text = "Hole Daten …";
  } else if (sync.status === "pushing") {
    tone = "syncing";
    text = "Sende Änderungen …";
  } else if (sync.status === "error") {
    tone = "error";
    text = `Sync-Fehler · ${sync.error ?? "unbekannt"}`;
  } else {
    tone = "ok";
    text = `Synchronisiert · ${sync.code}`;
  }

  return <Wrap $tone={tone}>{text}</Wrap>;
}
