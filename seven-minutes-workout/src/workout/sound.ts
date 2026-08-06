// Tiny WebAudio cue generator — no audio assets needed. Each cue is a short
// beep (or chord) synthesised on demand. The AudioContext is created lazily on
// the first cue so it is unlocked by the user gesture that starts the workout.

export type Cue = "start" | "work" | "rest" | "tick" | "finish";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(freq: number, durationMs: number, when: number, gain = 0.18): void {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ac.currentTime + when;
  const t1 = t0 + durationMs / 1000;
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(env).connect(ac.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

export function playCue(cue: Cue): void {
  switch (cue) {
    case "tick":
      beep(660, 90, 0, 0.12);
      break;
    case "work":
      // Rising two-tone "go".
      beep(660, 120, 0);
      beep(990, 180, 0.12);
      break;
    case "rest":
      // Falling two-tone "ease off".
      beep(520, 160, 0);
      beep(390, 200, 0.14);
      break;
    case "start":
      beep(523, 120, 0);
      break;
    case "finish":
      // Little fanfare.
      beep(523, 140, 0);
      beep(659, 140, 0.14);
      beep(784, 260, 0.28);
      break;
  }
}
