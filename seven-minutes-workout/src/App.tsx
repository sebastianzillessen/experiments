import { useCallback, useEffect, useState } from "react";
import {
  localProgressStore,
  type Progress,
  type Settings,
  type WorkoutSession,
  localDate,
} from "./storage/progress";
import { TOTAL_WORKOUT_SECONDS } from "./data/exercises";
import { useWorkoutEngine } from "./workout/useWorkoutEngine";
import { HomeScreen } from "./components/HomeScreen";
import { TimerScreen } from "./components/TimerScreen";
import { SummaryScreen } from "./components/SummaryScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { updateReminderTime } from "./push/subscribe";

type View = "home" | "active" | "summary" | "settings";

interface LastResult {
  finished: boolean;
  stationsCompleted: number;
  durationSeconds: number;
}

export function App() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [view, setView] = useState<View>("home");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  useEffect(() => {
    void localProgressStore.get().then(setProgress);
  }, []);

  const settings = progress?.settings;

  const handleFinish = useCallback(
    (finished: boolean, stationsCompleted: number, durationSeconds: number) => {
      const session: WorkoutSession = {
        completedAt: new Date().toISOString(),
        date: localDate(),
        stationsCompleted,
        finished,
        durationSeconds: durationSeconds || (finished ? TOTAL_WORKOUT_SECONDS : 0),
      };
      void localProgressStore.addSession(session).then(() =>
        localProgressStore.get().then(setProgress),
      );
      setLastResult({ finished, stationsCompleted, durationSeconds: session.durationSeconds });
      setView("summary");
    },
    [],
  );

  const engine = useWorkoutEngine({
    soundEnabled: settings?.soundEnabled ?? true,
    onFinish: handleFinish,
  });

  const saveSettings = useCallback(
    async (next: Settings) => {
      await localProgressStore.saveSettings(next);
      setProgress((p) => (p ? { ...p, settings: next } : p));
      // Keep the server-side reminder time in sync if reminders are on.
      if (next.remindersEnabled) {
        void updateReminderTime(next.reminderTime).catch(() => {});
      }
    },
    [],
  );

  if (!progress || !settings) {
    return <div className="loading">Lädt…</div>;
  }

  const startWorkout = () => {
    engine.start();
    setView("active");
  };

  return (
    <div className="app">
      {view === "home" && (
        <HomeScreen
          progress={progress}
          onStart={startWorkout}
          onOpenSettings={() => setView("settings")}
        />
      )}

      {view === "active" && (
        <TimerScreen
          engine={engine}
          gender={settings.gender}
          onQuit={() => {
            engine.stop();
          }}
        />
      )}

      {view === "summary" && lastResult && (
        <SummaryScreen
          result={lastResult}
          progress={progress}
          onRestart={startWorkout}
          onHome={() => setView("home")}
        />
      )}

      {view === "settings" && (
        <SettingsScreen
          settings={settings}
          onSave={saveSettings}
          onBack={() => setView("home")}
        />
      )}
    </div>
  );
}
