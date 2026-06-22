import type { UseWorkoutEngine } from "../workout/useWorkoutEngine";
import type { Gender } from "../storage/progress";
import { STATION_COUNT } from "../data/exercises";
import { ExerciseFigure } from "../figures/ExerciseFigure";

const RING_RADIUS = 130;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

export function TimerScreen({
  engine,
  gender,
  onQuit,
}: {
  engine: UseWorkoutEngine;
  gender: Gender;
  onQuit: () => void;
}) {
  const { phase, exercise, nextExercise, secondsLeft, phaseFraction, stationIndex, paused } =
    engine;

  const isWork = phase === "work";
  const isRest = phase === "rest";
  const isCountdown = phase === "countdown";

  const phaseLabel = isCountdown
    ? "Bereit machen"
    : isWork
      ? "Los geht's!"
      : isRest
        ? "Pause"
        : "";

  // The ring drains as the phase progresses.
  const dashOffset = RING_CIRC * phaseFraction;

  return (
    <div className={`screen timer timer--${phase}`}>
      <header className="timer__top">
        <span className="timer__station">
          {isCountdown ? "Start" : `Übung ${stationIndex + 1}/${STATION_COUNT}`}
        </span>
        <button className="icon-btn" onClick={onQuit} aria-label="Abbrechen">
          ✕
        </button>
      </header>

      <div className="timer__phase-label">{phaseLabel}</div>

      <div className="ring-wrap">
        <svg className="ring" viewBox="0 0 300 300" aria-hidden="true">
          <circle
            className="ring__track"
            cx="150"
            cy="150"
            r={RING_RADIUS}
            fill="none"
          />
          <circle
            className="ring__progress"
            cx="150"
            cy="150"
            r={RING_RADIUS}
            fill="none"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 150 150)"
            strokeLinecap="round"
          />
        </svg>
        <div className="ring__center">
          <div className="ring__seconds" aria-live="polite">
            {secondsLeft}
          </div>
          <div className="ring__unit">Sekunden</div>
        </div>
      </div>

      <div className="timer__exercise">
        {isRest && nextExercise ? (
          <>
            <ExerciseFigure
              gender={gender}
              exerciseId={nextExercise.id}
              emoji={nextExercise.emoji}
              active={false}
            />
            <div className="timer__next-label">Als Nächstes</div>
            <h2 className="timer__name">{nextExercise.name}</h2>
            <p className="timer__cue">{nextExercise.cue}</p>
          </>
        ) : (
          <>
            <ExerciseFigure
              gender={gender}
              exerciseId={exercise.id}
              emoji={exercise.emoji}
              active={isWork && !paused}
            />
            <h2 className="timer__name">{exercise.name}</h2>
            <p className="timer__cue">{exercise.cue}</p>
          </>
        )}
      </div>

      <div className="timer__controls">
        {paused ? (
          <button className="ctrl ctrl--primary" onClick={engine.resume}>
            ▶ Weiter
          </button>
        ) : (
          <button className="ctrl ctrl--primary" onClick={engine.pause}>
            ⏸ Pause
          </button>
        )}
        <button className="ctrl" onClick={engine.skip}>
          ⏭ Überspringen
        </button>
      </div>

      <div className="dots" aria-hidden="true">
        {Array.from({ length: STATION_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`dot ${i < stationIndex ? "dot--done" : ""} ${
              i === stationIndex ? "dot--current" : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}
