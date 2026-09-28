import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { attemptKey, dueMenuImports } from '../lib/menuSchedule.ts';
import { useKioskSettings } from './KioskMode.tsx';

// The kitchen screen fetches next week's menu by itself, from Friday
// afternoon, so nobody has to remember the button in the settings.
//
// Only the kiosk screen does it. That is not a detail: every import reads a
// PDF and costs a model call, and one device means two tablets can never buy
// the same week twice.

const CHECK_EVERY_MS = 30 * 60_000;
const STORAGE_KEY = 'fp.menuAutoImport';

/** When each week was last attempted, so a PDF that is not up yet is not hammered. */
function readAttempts(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeAttempts(attempts: Record<string, number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
  } catch {
    // Blocked storage only costs us the throttle, so carry on.
  }
}

export function useMenuAutoImport() {
  const { family, menuSources, menuWeeks, canEdit, importMenuWeek } = useApp();
  const kiosk = useKioskSettings();
  const tz = family?.timezone ?? 'Europe/Zurich';

  // The check reads all of these, but must not restart its timer whenever the
  // plan reloads — so it reads them through a ref.
  const state = useRef({ menuSources, menuWeeks, canEdit, importMenuWeek, tz });
  state.current = { menuSources, menuWeeks, canEdit, importMenuWeek, tz };

  const running = useRef(false);

  useEffect(() => {
    if (!kiosk.enabled) return;

    async function check() {
      const { menuSources: sources, menuWeeks: weeks, canEdit: mayEdit, importMenuWeek: run, tz: zone }
        = state.current;
      // Importing writes to the family, which a viewer may not do.
      if (!mayEdit || running.current) return;

      const attempts = readAttempts();
      const overdue = dueMenuImports({
        nowMs: Date.now(), timeZone: zone, sources, weeks, attempts,
      });
      if (overdue.length === 0) return;

      running.current = true;
      try {
        for (const week of overdue) {
          // Remember the attempt before making it: a failure that never
          // returns must not turn into a request every half hour.
          attempts[attemptKey(week)] = Date.now();
          writeAttempts(attempts);
          await run(week.sourceId, week.year, week.week);
        }
      } finally {
        running.current = false;
      }
    }

    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [kiosk.enabled]);
}
