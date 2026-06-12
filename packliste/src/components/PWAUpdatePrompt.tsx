import { useRegisterSW } from "virtual:pwa-register/react";
import { styled } from "next-yak";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/Button";
import { colors, radii, shadows } from "../theme.yak";

// Stündlich auf eine neue Version prüfen, solange die App offen ist — sonst
// merkt eine dauerhaft geöffnete Home-Screen-App ein Update erst beim
// nächsten Kaltstart.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const Banner = styled.div`
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 300;
  width: 92vw;
  max-width: 420px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: ${colors.ink};
  color: #fff;
  border-radius: ${radii.md};
  box-shadow: ${shadows.md};
`;

const Text = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
`;

const DismissBtn = styled.button`
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font: inherit;
  font-weight: 600;
  font-size: 13px;
  padding: 6px 8px;
  cursor: pointer;
  &:hover { color: #fff; }
`;

/**
 * Zeigt unten ein Banner, sobald ein neuer Service-Worker bereitsteht. Der
 * Nutzer entscheidet selbst, wann aktualisiert wird (kein erzwungener Reload
 * mitten in der Bearbeitung). Rendert nichts, solange kein Update ansteht.
 */
export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {
          /* offline o. Ä. — beim nächsten Intervall erneut versuchen */
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <Banner role="alert">
      <Text>Neue Version verfügbar.</Text>
      <DismissBtn type="button" onClick={() => setNeedRefresh(false)}>
        Später
      </DismissBtn>
      <Button $size="sm" onClick={() => updateServiceWorker(true)}>
        <RefreshCw size={14} /> Aktualisieren
      </Button>
    </Banner>
  );
}
