import { AppProvider, useApp } from './context/AppContext.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { CreateFamilyScreen } from './components/CreateFamilyScreen.tsx';
import { Planner } from './components/Planner.tsx';
import { UpdatePrompt } from './components/UpdatePrompt.tsx';

function Screens() {
  const { screen } = useApp();
  if (screen === 'loading') {
    return <div className="boot" role="status">Familienplaner wird geladen …</div>;
  }
  if (screen === 'login') return <LoginScreen />;
  if (screen === 'create-family') return <CreateFamilyScreen />;
  return <Planner />;
}

export default function App() {
  return (
    <AppProvider>
      <Screens />
      <UpdatePrompt />
    </AppProvider>
  );
}
