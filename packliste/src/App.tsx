import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { SyncIndicator } from "./components/SyncIndicator";
import { ReminderRunner } from "./components/ReminderRunner";
import { TripShareRunner } from "./components/TripShareRunner";
import { ToastProvider } from "./components/ui/Toast";
import { SyncProvider } from "./data/SyncContext";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useCurrentFamily } from "./hooks/useFamily";
import { AuthGate } from "./auth/AuthGate";
import { CreateFamilyScreen } from "./auth/CreateFamilyScreen";
import { TripsTab } from "./trips/TripsTab";
import { TripDetail } from "./trips/TripDetail";
import { TripPrint } from "./trips/TripPrint";
import { SharedTripView } from "./trips/SharedTripView";
import { TemplateTab } from "./items/TemplateTab";
import { FamilyTab } from "./family/FamilyTab";
import { InfoTab } from "./info/InfoTab";

function readShareCode(): string | null {
  const m = window.location.hash.match(/^#\/share\/([A-Z2-9]+)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Beobachtet den URL-Hash auf die öffentliche Share-Route (#/share/:code).
 * Läuft absichtlich VOR dem HashRouter: die Nur-Lese-Ansicht braucht
 * weder Login noch Familie und darf nicht am AuthGate hängen bleiben.
 */
function useShareCodeFromHash(): string | null {
  const [code, setCode] = useState(readShareCode);
  useEffect(() => {
    const onHash = () => setCode(readShareCode());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return code;
}

/**
 * Share-Route INNERHALB des Routers — greift, wenn ein eingeloggter
 * Nutzer zu #/share/:code navigiert. Ohne diese Route würde der
 * Catch-All (`*` → Navigate "/") den Hash sofort umschreiben, bevor der
 * Pre-Auth-Check in App() rendern kann.
 */
function SharedTripRoute() {
  const { code } = useParams<{ code: string }>();
  return <SharedTripView code={(code ?? "").toUpperCase()} />;
}

export function App() {
  const shareCode = useShareCodeFromHash();
  const user = useCurrentUser();
  const family = useCurrentFamily();

  // Geteilter Nur-Lese-Link: ohne Login und ohne lokale Daten rendern.
  if (shareCode) return <SharedTripView code={shareCode} />;

  if (!user) return <AuthGate />;
  if (!family) return <CreateFamilyScreen />;

  return (
    <ToastProvider>
      <SyncProvider>
        <ReminderRunner />
        <TripShareRunner />
        <HashRouter>
          <Routes>
            <Route path="/trip/:id" element={<TripDetail />} />
            <Route path="/trip/:id/print" element={<TripPrint />} />
            <Route path="/share/:code" element={<SharedTripRoute />} />
            <Route element={<AppShell />}>
              <Route index element={<TripsTab />} />
              <Route path="/vorlage" element={<TemplateTab />} />
              <Route path="/familie" element={<FamilyTab />} />
              <Route path="/info" element={<InfoTab />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <SyncIndicator />
        </HashRouter>
      </SyncProvider>
    </ToastProvider>
  );
}
