import { useCallback, useEffect, useRef, useState } from "react";
import {
  COUNTDOWN_SECONDS,
  EXERCISES,
  REST_SECONDS,
  STATION_COUNT,
  WORK_SECONDS,
  type Exercise,
} from "../data/exercises";
import { playCue, type Cue } from "./sound";

export type Phase = "idle" | "countdown" | "work" | "rest" | "done";

export interface WorkoutState {
  phase: Phase;
  /** 0-based index of the current/last station. */
  stationIndex: number;
  /** Seconds remaining in the current phase. */
  secondsLeft: number;
  /** Whether the timer is paused. */
  paused: boolean;
  /** Active seconds elapsed since start (excludes paused time). */
  elapsedSeconds: number;
  /** Current exercise (during countdown it is the upcoming first one). */
  exercise: Exercise;
  /** Next exercise, or null on the last station. */
  nextExercise: Exercise | null;
  /** 0..1 progress through the whole circuit (by station). */
  circuitFraction: number;
  /** 0..1 progress through the current phase (for the ring). */
  phaseFraction: number;
}

function phaseDuration(phase: Phase): number {
  switch (phase) {
    case "countdown":
      return COUNTDOWN_SECONDS;
    case "work":
      return WORK_SECONDS;
    case "rest":
      return REST_SECONDS;
    default:
      return 0;
  }
}

interface Internal {
  phase: Phase;
  stationIndex: number;
  secondsLeft: number;
  elapsedSeconds: number;
}

const INITIAL: Internal = {
  phase: "idle",
  stationIndex: 0,
  secondsLeft: 0,
  elapsedSeconds: 0,
};

export interface UseWorkoutEngine extends WorkoutState {
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** Skip the remainder of the current phase. */
  skip: () => void;
  /** Abort and return to idle. */
  stop: () => void;
}

/**
 * Drives the 12-station circuit. The authoritative state lives in a ref and is
 * mirrored into React state for rendering, so the 1 Hz interval never reads a
 * stale closure. `onFinish(finished, stationsCompleted, durationSeconds)` fires
 * once when the workout ends (completed or stopped early).
 */
export function useWorkoutEngine(opts: {
  soundEnabled: boolean;
  onFinish?: (finished: boolean, stationsCompleted: number, durationSeconds: number) => void;
}): UseWorkoutEngine {
  const ref = useRef<Internal>({ ...INITIAL });
  const [, forceRender] = useState(0);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef(opts.soundEnabled);
  const onFinishRef = useRef(opts.onFinish);
  soundRef.current = opts.soundEnabled;
  onFinishRef.current = opts.onFinish;

  const sync = useCallback(() => forceRender((n) => n + 1), []);

  const cue = useCallback((c: Cue) => {
    if (soundRef.current) playCue(c);
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const finish = useCallback(
    (finished: boolean) => {
      clearTimer();
      const s = ref.current;
      const stations = finished ? STATION_COUNT : s.phase === "work" ? s.stationIndex : s.stationIndex;
      ref.current = { ...s, phase: "done", secondsLeft: 0 };
      cue("finish");
      onFinishRef.current?.(finished, finished ? STATION_COUNT : Math.max(0, stations), s.elapsedSeconds);
      sync();
    },
    [clearTimer, cue, sync],
  );

  // Advance to the next phase when the current one elapses.
  const advance = useCallback(() => {
    const s = ref.current;
    if (s.phase === "countdown") {
      ref.current = { ...s, phase: "work", secondsLeft: WORK_SECONDS };
      cue("work");
    } else if (s.phase === "work") {
      if (s.stationIndex >= STATION_COUNT - 1) {
        finish(true);
        return;
      }
      ref.current = { ...s, phase: "rest", secondsLeft: REST_SECONDS };
      cue("rest");
    } else if (s.phase === "rest") {
      ref.current = {
        ...s,
        phase: "work",
        stationIndex: s.stationIndex + 1,
        secondsLeft: WORK_SECONDS,
      };
      cue("work");
    }
    sync();
  }, [cue, finish, sync]);

  const tick = useCallback(() => {
    if (pausedRef.current) return;
    const s = ref.current;
    if (s.phase === "idle" || s.phase === "done") return;

    const next = s.secondsLeft - 1;
    const elapsed = s.elapsedSeconds + 1;
    if (next <= 0) {
      ref.current = { ...s, secondsLeft: 0, elapsedSeconds: elapsed };
      advance();
    } else {
      ref.current = { ...s, secondsLeft: next, elapsedSeconds: elapsed };
      // Last three seconds of a phase get a short tick.
      if (next <= 3) cue("tick");
      sync();
    }
  }, [advance, cue, sync]);

  const ensureTimer = useCallback(() => {
    clearTimer();
    timer.current = setInterval(tick, 1000);
  }, [clearTimer, tick]);

  const start = useCallback(() => {
    ref.current = {
      phase: "countdown",
      stationIndex: 0,
      secondsLeft: COUNTDOWN_SECONDS,
      elapsedSeconds: 0,
    };
    pausedRef.current = false;
    setPaused(false);
    cue("start");
    ensureTimer();
    sync();
  }, [cue, ensureTimer, sync]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
  }, []);

  const skip = useCallback(() => {
    const s = ref.current;
    if (s.phase === "idle" || s.phase === "done") return;
    ref.current = { ...s, secondsLeft: 0 };
    advance();
  }, [advance]);

  const stop = useCallback(() => {
    if (ref.current.phase === "idle") return;
    finish(false);
  }, [finish]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const s = ref.current;
  const exercise = EXERCISES[Math.min(s.stationIndex, STATION_COUNT - 1)];
  const nextExercise =
    s.stationIndex < STATION_COUNT - 1 ? EXERCISES[s.stationIndex + 1] : null;
  const dur = phaseDuration(s.phase);

  return {
    phase: s.phase,
    stationIndex: s.stationIndex,
    secondsLeft: s.secondsLeft,
    paused,
    elapsedSeconds: s.elapsedSeconds,
    exercise,
    nextExercise,
    circuitFraction:
      s.phase === "done" ? 1 : s.stationIndex / STATION_COUNT,
    phaseFraction: dur === 0 ? 0 : (dur - s.secondsLeft) / dur,
    start,
    pause,
    resume,
    skip,
    stop,
  };
}
