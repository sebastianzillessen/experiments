import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { SyncIndicator } from "./components/SyncIndicator";
import { ToastProvider } from "./components/ui/Toast";
import { SyncProvider } from "./data/SyncContext";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useCurrentFamily } from "./hooks/useFamily";
import { AuthGate } from "./auth/AuthGate";
import { CreateFamilyScreen } from "./auth/CreateFamilyScreen";
import { TripsTab } from "./trips/TripsTab";
import { TripDetail } from "./trips/TripDetail";
import { TripPrint } from "./trips/TripPrint";
import { TemplateTab } from "./items/TemplateTab";
import { FamilyTab } from "./family/FamilyTab";
import { InfoTab } from "./info/InfoTab";

export function App() {
  const user = useCurrentUser();
  const family = useCurrentFamily();

  if (!user) return <AuthGate />;
  if (!family) return <CreateFamilyScreen />;

  return (
    <ToastProvider>
      <SyncProvider>
        <HashRouter>
          <Routes>
            <Route path="/trip/:id" element={<TripDetail />} />
            <Route path="/trip/:id/print" element={<TripPrint />} />
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
