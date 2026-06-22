import {
  currentStreak,
  totalFinished,
  type Progress,
} from "../storage/progress";
import { STATION_COUNT } from "../data/exercises";

export function SummaryScreen({
  result,
  progress,
  onRestart,
  onHome,
}: {
  result: { finished: boolean; stationsCompleted: number; durationSeconds: number };
  progress: Progress;
  onRestart: () => void;
  onHome: () => void;
}) {
  const streak = currentStreak(progress.sessions);
  const total = totalFinished(progress.sessions);
  const mins = Math.floor(result.durationSeconds / 60);
  const secs = result.durationSeconds % 60;

  return (
    <div className="screen summary">
      <div className="summary__emoji">{result.finished ? "🎉" : "👍"}</div>
      <h1 className="summary__title">
        {result.finished ? "Geschafft!" : "Gut gemacht!"}
      </h1>
      <p className="summary__subtitle">
        {result.finished
          ? "Du hast das komplette 7-Minuten-Workout absolviert."
          : `Du hast ${result.stationsCompleted}/${STATION_COUNT} Übungen geschafft.`}
      </p>

      <div className="stats">
        <div className="stat">
          <span className="stat__value">
            {result.stationsCompleted}/{STATION_COUNT}
          </span>
          <span className="stat__label">Übungen</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {mins}:{String(secs).padStart(2, "0")}
          </span>
          <span className="stat__label">Aktive Zeit</span>
        </div>
        <div className="stat">
          <span className="stat__value">{streak}🔥</span>
          <span className="stat__label">Serie</span>
        </div>
      </div>

      <p className="summary__total">Insgesamt {total} abgeschlossene Workouts</p>

      <div className="summary__actions">
        <button className="cta" onClick={onRestart}>
          ↻ Nochmal
        </button>
        <button className="cta cta--ghost" onClick={onHome}>
          Zur Übersicht
        </button>
      </div>
    </div>
  );
}
