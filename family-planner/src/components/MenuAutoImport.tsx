import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { dueMenuImports } from '../lib/menuSchedule.ts';

// Any screen with edit rights fills in a missing lunch menu, so the plan
// appears without anyone pressing a button.
//
// Several screens asking at once is fine and deliberate: the Edge Function
// holds the family to one automatic import per half hour, which is the only
// place that brake can live — the devices cannot see each other, and the
// function is where the PDF and the model call are paid for. A device that is
// turned down gets a cheap "skipped: throttled" and shrugs.

const CHECK_EVERY_MS = 30 * 60_000;

export function useMenuAutoImport() {
  const { family, menuSources, menuWeeks, canEdit, importMenuWeek } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';

  // The check reads all of these, but must not restart its timer whenever the
  // plan reloads — so it reads them through a ref.
  const state = useRef({ menuSources, menuWeeks, canEdit, importMenuWeek, tz });
  state.current = { menuSources, menuWeeks, canEdit, importMenuWeek, tz };

  const running = useRef(false);

  useEffect(() => {
    async function check() {
      const { menuSources: sources, menuWeeks: weeks, canEdit: mayEdit, importMenuWeek: run, tz: zone }
        = state.current;
      // Importing writes to the family, which a viewer may not do.
      if (!mayEdit || running.current) return;

      const missing = dueMenuImports({ nowMs: Date.now(), timeZone: zone, sources, weeks });
      if (missing.length === 0) return;

      running.current = true;
      try {
        // One per round: the first spends the family's half hour, so the rest
        // would only be turned down. They come back on the next tick.
        const [first] = missing;
        await run(first.sourceId, first.year, first.week, undefined, true);
      } finally {
        running.current = false;
      }
    }

    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);
}
