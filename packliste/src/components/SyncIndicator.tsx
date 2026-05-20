import { styled } from "next-yak";
import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";
import { colors } from "../theme.yak";

const Wrap = styled.div<{ $tone: "ok" | "syncing" | "error" }>`
  position: fixed;
  right: 14px;
  /* Default: oberhalb der mobilen Bottom-Nav + Safe-Area */
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  background: ${({ $tone }) =>
    $tone === "ok" ? colors.successSoft : $tone === "syncing" ? colors.primarySoft : colors.dangerSoft};
  color: ${({ $tone }) =>
    $tone === "ok" ? colors.success : $tone === "syncing" ? colors.primary : colors.danger};
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  z-index: 50;
  pointer-events: none;
  @media (min-width: 601px) {
    /* Auf Desktop: einfach unten rechts ohne Bottom-Nav-Reservierung */
    bottom: 14px;
  }
  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
`;

export function SyncIndicator() {
  const provider = useDataProvider();
  useProviderRevision();
  const status = provider.getSyncStatus();
  if (status === "local") return <Wrap $tone="ok">Lokal gespeichert</Wrap>;
  if (status === "syncing") return <Wrap $tone="syncing">Synchronisiere …</Wrap>;
  return <Wrap $tone="error">Fehler</Wrap>;
}
