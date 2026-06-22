import {
  currentStreak,
  totalFinished,
  type Progress,
} from "../storage/progress";
import {
  EXERCISES,
  STATION_COUNT,
  TOTAL_WORKOUT_SECONDS,
} from "../data/exercises";

export function HomeScreen({
  progress,
  onStart,
  onOpenSettings,
}: {
  progress: Progress;
  onStart: () => void;
  onOpenSettings: () => void;
}) {
  const streak = currentStreak(progress.sessions);
  const total = totalFinished(progress.sessions);
  const minutes = Math.round(TOTAL_WORKOUT_SECONDS / 60);

  return (
    <div className="screen home">
      <header className="home__header">
        <div>
          <h1 className="home__title">7-Minuten Workout</h1>
          <p className="home__subtitle">
            {STATION_COUNT} Übungen · 30 s Belastung / 10 s Pause
          </p>
        </div>
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Einstellungen"
        >
          ⚙️
        </button>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat__value">{streak}🔥</span>
          <span className="stat__label">Serie (Tage)</span>
        </div>
        <div className="stat">
          <span className="stat__value">{total}</span>
          <span className="stat__label">Workouts</span>
        </div>
        <div className="stat">
          <span className="stat__value">~{minutes}′</span>
          <span className="stat__label">Dauer</span>
        </div>
      </div>

      <button className="cta" onClick={onStart}>
        ▶ Workout starten
      </button>

      <section className="preview">
        <h2 className="preview__title">Die Übungen</h2>
        <ol className="preview__list">
          {EXERCISES.map((ex, i) => (
            <li key={ex.id} className="preview__item">
              <span className="preview__num">{i + 1}</span>
              <span className="preview__emoji" aria-hidden="true">
                {ex.emoji}
              </span>
              <span className="preview__name">{ex.name}</span>
              <span className="preview__target">{ex.target}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
