import { createRoot } from 'react-dom/client';
import App from './App';

// No StrictMode on purpose: the Supabase client must initialise (and consume
// the magic-link URL hash) exactly once, mirroring the vanilla app.
createRoot(document.getElementById('root')!).render(<App />);
