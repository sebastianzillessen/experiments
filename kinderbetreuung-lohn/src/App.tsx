import { AppProvider } from './context/AppContext';
import { LoginScreen } from './components/LoginScreen';
import { InviteBanner } from './components/InviteBanner';
import { CreateHouseholdScreen } from './components/CreateHouseholdScreen';
import { Header, UserStrip, TabNav, SyncWarn, SyncStatus } from './components/Chrome';
import { ErfassungTab } from './tabs/ErfassungTab';
import { MonatTab } from './tabs/MonatTab';
import { JahrTab } from './tabs/JahrTab';
import { StammdatenTab } from './tabs/StammdatenTab';
import { EinstellungenTab } from './tabs/EinstellungenTab';
import { MitgliederTab } from './tabs/MitgliederTab';
import { InfoTab } from './tabs/InfoTab';

// DOM order mirrors the vanilla index.html: overlays, header, user strip,
// nav, sync warn, main with all 7 sections (always mounted — display is
// controlled via section.active / section.printing CSS), sync status.
export default function App() {
  return (
    <AppProvider>
      <LoginScreen />
      <InviteBanner />
      <CreateHouseholdScreen />
      <Header />
      <UserStrip />
      <TabNav />
      <SyncWarn />
      <main>
        <ErfassungTab />
        <MonatTab />
        <JahrTab />
        <StammdatenTab />
        <EinstellungenTab />
        <MitgliederTab />
        <InfoTab />
      </main>
      <SyncStatus />
    </AppProvider>
  );
}
