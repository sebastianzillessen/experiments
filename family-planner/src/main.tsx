import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

// No StrictMode on purpose: the Supabase client must initialise (and consume a
// magic-link URL hash) exactly once, same as in Salärli.
createRoot(document.getElementById('root')!).render(<App />);
