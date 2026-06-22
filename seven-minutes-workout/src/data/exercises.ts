// The "Scientific 7-Minute Workout" (Klika & Jordan, ACSM Health & Fitness
// Journal, 2013): 12 bodyweight exercises performed for 30 s each with 10 s
// rest in between, in a single circuit. ~7 minutes total.

export const WORK_SECONDS = 30;
export const REST_SECONDS = 10;
export const COUNTDOWN_SECONDS = 5; // "get ready" before the first exercise

/** Stable id used for figure art lookup and progress records. */
export type ExerciseId =
  | "jumping-jacks"
  | "wall-sit"
  | "push-ups"
  | "crunches"
  | "step-up"
  | "squats"
  | "triceps-dip"
  | "plank"
  | "high-knees"
  | "lunges"
  | "push-up-rotation"
  | "side-plank";

export interface Exercise {
  id: ExerciseId;
  /** German display name. */
  name: string;
  /** Primary muscle group (German). */
  target: string;
  /** Short form cue shown under the timer. */
  cue: string;
  /** Emoji used as a lightweight placeholder next to the figure. */
  emoji: string;
}

export const EXERCISES: Exercise[] = [
  { id: "jumping-jacks", name: "Hampelmann", target: "Ganzkörper", cue: "Arme und Beine im Takt öffnen und schließen.", emoji: "🤸" },
  { id: "wall-sit", name: "Wandsitz", target: "Beine", cue: "Rücken an die Wand, Oberschenkel parallel zum Boden.", emoji: "🧱" },
  { id: "push-ups", name: "Liegestütze", target: "Brust & Arme", cue: "Körper gerade halten, kontrolliert absenken.", emoji: "💪" },
  { id: "crunches", name: "Crunches", target: "Bauch", cue: "Schulterblätter anheben, Bauch anspannen.", emoji: "🔥" },
  { id: "step-up", name: "Step-ups", target: "Beine & Gesäß", cue: "Abwechselnd auf einen Stuhl steigen.", emoji: "🪜" },
  { id: "squats", name: "Kniebeugen", target: "Beine & Gesäß", cue: "Hüfte zurück, Knie über den Zehen.", emoji: "🦵" },
  { id: "triceps-dip", name: "Trizeps-Dips", target: "Arme", cue: "An der Stuhlkante absenken, Ellbogen nach hinten.", emoji: "🪑" },
  { id: "plank", name: "Unterarmstütz", target: "Rumpf", cue: "Gerade Linie von Kopf bis Ferse halten.", emoji: "🪵" },
  { id: "high-knees", name: "Knieheben", target: "Ausdauer", cue: "Auf der Stelle laufen, Knie hoch.", emoji: "🏃" },
  { id: "lunges", name: "Ausfallschritte", target: "Beine", cue: "Großer Schritt nach vorn, Knie tief.", emoji: "🚶" },
  { id: "push-up-rotation", name: "Liegestütz mit Drehung", target: "Brust & Rumpf", cue: "Nach jedem Stütz zur Seite öffnen.", emoji: "🔄" },
  { id: "side-plank", name: "Seitstütz", target: "Rumpf seitlich", cue: "Halbzeit pro Seite, Hüfte hoch.", emoji: "📐" },
];

export const STATION_COUNT = EXERCISES.length; // 12

/** Total nominal duration in seconds (work + rests between stations). */
export const TOTAL_WORKOUT_SECONDS =
  STATION_COUNT * WORK_SECONDS + (STATION_COUNT - 1) * REST_SECONDS;
