import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Home-screen installs otherwise sit on a stale build forever. The service
// worker is registered in "prompt" mode, so a new deploy shows this banner
// instead of swapping the app under the user's fingers.
export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
    });
  }, []);

  if (!needRefresh) return null;
  return (
    <div className="update-prompt" role="status">
      <span className="grow">Neue Version verfügbar.</span>
      <button onClick={() => updateRef.current?.(true)}>Aktualisieren</button>
      <button onClick={() => setNeedRefresh(false)}>Später</button>
    </div>
  );
}
