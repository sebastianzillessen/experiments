import { useState } from "react";
import { styled } from "next-yak";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Copy, Share2, Link2, Trash2, Eye } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Muted, Note, Row, Stack } from "../components/ui/Layout";
import { useToast } from "../components/ui/Toast";
import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";
import type { Trip } from "../types";
import { colors, radii, shadows } from "../theme.yak";

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 100;
`;

const Content = styled(Dialog.Content)`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 101;
  padding: 12px;
  pointer-events: none;
  @media (min-width: 600px) {
    align-items: center;
  }
  & > * {
    pointer-events: auto;
  }
`;

const Sheet = styled.div`
  background: ${colors.surface};
  border-radius: ${radii.md};
  padding: 18px;
  width: 100%;
  max-width: 460px;
  max-height: 90dvh;
  overflow-y: auto;
  box-shadow: ${shadows.md};
  position: relative;
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  color: ${colors.ink3};
  padding: 4px;
`;

const LinkBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${colors.surface2};
  border: 1px solid ${colors.line};
  border-radius: ${radii.sm};
  padding: 8px 10px;
  font-size: 13px;
  color: ${colors.ink2};
  overflow: hidden;

  span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
`;

function shareUrlFor(code: string): string {
  // BASE_URL ist "/packliste/" im Build bzw. Dev-Server — der Link muss
  // von überall funktionieren, daher absolute URL.
  return `${window.location.origin}${import.meta.env.BASE_URL}#/share/${code}`;
}

interface Props {
  trip: Trip;
  onClose: () => void;
}

/**
 * Dialog zum Teilen eines Trips als Nur-Lese-Link. Erzeugt beim ersten
 * Teilen einen Share-Code beim Worker; danach hält der TripShareRunner
 * den Link automatisch aktuell. Der Link kann jederzeit widerrufen
 * werden — der Remote-Eintrag wird dann gelöscht.
 */
export function TripShareModal({ trip, onClose }: Props) {
  const provider = useDataProvider();
  useProviderRevision();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const code = provider.getTripShareCode(trip.id);
  const url = code ? shareUrlFor(code) : null;
  const canNativeShare = typeof navigator.share === "function";

  async function createLink() {
    setBusy(true);
    try {
      await provider.shareTripToRemote(trip.id);
      toast.show({ message: "Nur-Lese-Link erstellt" });
    } catch (e) {
      toast.show({
        message: `Teilen fehlgeschlagen: ${e instanceof Error ? e.message : "Unbekannter Fehler"}`,
        duration: 6000,
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ message: "Link kopiert" });
    } catch {
      toast.show({ message: "Kopieren nicht möglich — Link manuell markieren", duration: 5000 });
    }
  }

  async function nativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title: `Packliste: ${trip.name}`, url });
    } catch {
      // Abbruch durch Nutzer — kein Fehler
    }
  }

  async function revoke() {
    if (!confirm("Link deaktivieren? Wer ihn hat, kann die Liste danach nicht mehr sehen.")) {
      return;
    }
    setBusy(true);
    try {
      await provider.revokeTripShare(trip.id);
      toast.show({ message: "Link deaktiviert" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Sheet>
            <Dialog.Title style={{ margin: "0 0 4px", fontSize: 18 }}>
              Trip teilen
            </Dialog.Title>
            <Dialog.Description asChild>
              <Muted style={{ display: "block", marginBottom: 14 }}>
                Nur-Lese-Link für „{trip.name}" — zum Mitschauen, ohne App und ohne Login.
              </Muted>
            </Dialog.Description>
            <Dialog.Close asChild>
              <CloseBtn aria-label="Schließen">
                <X size={18} />
              </CloseBtn>
            </Dialog.Close>

            {url ? (
              <Stack $gap={10}>
                <LinkBox>
                  <Link2 size={14} style={{ flexShrink: 0 }} />
                  <span>{url}</span>
                </LinkBox>
                <Row $gap={8} $wrap>
                  <Button $size="sm" onClick={() => void copyLink()}>
                    <Copy size={14} /> Link kopieren
                  </Button>
                  {canNativeShare && (
                    <Button $variant="secondary" $size="sm" onClick={() => void nativeShare()}>
                      <Share2 size={14} /> Teilen …
                    </Button>
                  )}
                </Row>
                <Note>
                  <Eye size={13} style={{ verticalAlign: "-2px" }} /> Der Link zeigt den
                  Live-Stand der Packliste (nur lesen). Er bleibt 30 Tage nach der letzten
                  Änderung gültig und aktualisiert sich automatisch.
                </Note>
                <Button
                  $variant="ghost"
                  $size="sm"
                  onClick={() => void revoke()}
                  disabled={busy}
                  style={{ color: colors.danger, alignSelf: "flex-start" }}
                >
                  <Trash2 size={14} /> Link deaktivieren
                </Button>
              </Stack>
            ) : (
              <Stack $gap={12}>
                <Muted>
                  Erstellt einen Link, über den z.B. Grosseltern oder Mitreisende die
                  Packliste dieses Trips ansehen können — inklusive Pack-Fortschritt,
                  aber ohne etwas ändern zu können.
                </Muted>
                <Button onClick={() => void createLink()} disabled={busy}>
                  <Share2 size={15} /> {busy ? "Wird erstellt …" : "Nur-Lese-Link erstellen"}
                </Button>
              </Stack>
            )}
          </Sheet>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
