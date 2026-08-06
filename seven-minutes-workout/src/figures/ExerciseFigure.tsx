import type { ExerciseId } from "../data/exercises";
import type { Gender } from "../storage/progress";
import { MaleFigure } from "./MaleFigure";
import { FemaleFigure } from "./FemaleFigure";

/**
 * The single seam between the app and the exercise artwork. Today it renders a
 * static gendered silhouette plus the exercise emoji. When real animations
 * arrive, switch on `exerciseId` here (e.g. render a Lottie/SVG animation per
 * exercise and gender) — no caller needs to change.
 */
export function ExerciseFigure({
  gender,
  exerciseId,
  emoji,
  active,
}: {
  gender: Gender;
  exerciseId: ExerciseId;
  emoji: string;
  /** Whether to show the subtle "breathing" animation (during work phase). */
  active: boolean;
}) {
  const Figure = gender === "female" ? FemaleFigure : MaleFigure;
  return (
    <div className={`figure ${active ? "figure--active" : ""}`} data-exercise={exerciseId}>
      <Figure className="figure__silhouette" />
      <span className="figure__emoji" aria-hidden="true">
        {emoji}
      </span>
    </div>
  );
}
