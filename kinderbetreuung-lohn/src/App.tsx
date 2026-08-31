import { AppProvider } from './context/AppContext';
import { LoginScreen } from './components/LoginScreen';
import { InviteBanner } from './components/InviteBanner';
import { CreateHouseholdScreen } from './components/CreateHouseholdScreen';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { Header, UserStrip, TabNav, SyncWarn, SyncStatus, AppVersionFooter } from './components/Chrome';
import { OnboardingBanner } from './components/Onboarding';
import { DevMenu } from './components/DevMenu';
import { HelpAssistant } from './components/HelpAssistant';
import { UpdatePrompt } from './components/UpdatePrompt';
import { ErfassungTab } from './tabs/ErfassungTab';
import { MonatTab } from './tabs/MonatTab';
import { JahrTab } from './tabs/JahrTab';
import { StammdatenTab } from './tabs/StammdatenTab';
import { MitarbeitendeTab } from './tabs/MitarbeitendeTab';
import { EinstellungenTab } from './tabs/EinstellungenTab';
import { MitgliederTab } from './tabs/MitgliederTab';
import { InfoTab } from './tabs/InfoTab';

// DOM order mirrors the vanilla index.html: overlays, header, user strip,
// nav, sync warn, main with all 8 sections (always mounted — display is
// controlled via section.active CSS, printing via static @media print rules),
// sync status, version footer.
export default function App() {
  return (
    <AppProvider>
      <LoginScreen />
      <InviteBanner />
      <CreateHouseholdScreen />
      <SetPasswordScreen />
      <Header />
      <UserStrip />
      <TabNav />
      <SyncWarn />
      <OnboardingBanner />
      <main>
        <ErfassungTab />
        <MonatTab />
        <JahrTab />
        <StammdatenTab />
        <MitarbeitendeTab />
        <EinstellungenTab />
        <MitgliederTab />
        <InfoTab />
      </main>
      <SyncStatus />
      <AppVersionFooter />
      <HelpAssistant />
      <DevMenu />
      <UpdatePrompt />
    </AppProvider>
  );
}
