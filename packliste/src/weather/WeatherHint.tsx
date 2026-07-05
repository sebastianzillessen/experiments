import { styled } from "next-yak";
import { CloudSun, Plus, Check } from "lucide-react";
import { Chip, Chips } from "../components/ui/Chip";
import { Muted } from "../components/ui/Layout";
import { conditionEmoji, conditionLabel } from "../labels";
import { colors, radii } from "../theme.yak";
import type { TripWeather } from "./useTripWeather";

const Panel = styled.div`
  border: 1px solid ${colors.line};
  background: ${colors.surface2};
  border-radius: ${radii.sm};
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HeadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: ${colors.ink};
`;

const Stats = styled.div`
  font-size: 13px;
  color: ${colors.ink2};
  font-variant-numeric: tabular-nums;
`;

const Reason = styled.div`
  font-size: 13px;
  color: ${colors.ink2};
  line-height: 1.35;
`;

interface Props {
  weather: TripWeather;
  /** Bereits aktive Bedingungen — entscheidet, ob ein Vorschlag als "drin" gilt. */
  activeConditions?: string[];
  /** Klick auf einen Vorschlags-Chip. Ohne Handler werden keine Chips gezeigt. */
  onApplyCondition?: (key: string) => void;
}

/**
 * Zeigt einen informativen Wetter-Hinweis zum Reiseziel/Zeitraum. Ändert von
 * sich aus nichts — Vorschläge werden nur als Text und (optional) als per Tap
 * übernehmbare Chips angeboten.
 */
export function WeatherHint({ weather, activeConditions = [], onApplyCondition }: Props) {
  const { status } = weather;

  if (status === "idle" || status === "past" || status === "error") return null;

  if (status === "too-far") {
    return (
      <Panel>
        <Muted style={{ fontSize: 13 }}>
          🌤 Wettervorhersage erst näher am Termin verfügbar (ab ca. 2 Wochen vorher).
        </Muted>
      </Panel>
    );
  }

  if (status === "loading") {
    return (
      <Panel>
        <Muted style={{ fontSize: 13 }}>🌤 Wetter wird geladen …</Muted>
      </Panel>
    );
  }

  if (status === "not-found") {
    return (
      <Panel>
        <Muted style={{ fontSize: 13 }}>
          🌍 Ort nicht gefunden — Reiseziel anpassen für eine Wettervorhersage.
        </Muted>
      </Panel>
    );
  }

  // status === "ready"
  const { place, summary, recommendation } = weather;
  if (!place || !summary || !recommendation) return null;

  const recommended = recommendation.conditions;

  return (
    <Panel>
      <HeadRow>
        <CloudSun size={16} />
        Wetter in {place.name}
        {place.country ? `, ${place.country}` : ""}
      </HeadRow>
      <Stats>
        🌡 {Math.round(summary.tMin)}–{Math.round(summary.tMax)}°C · ☔ bis {Math.round(summary.maxPrecipProb)}%
      </Stats>

      {recommendation.reasons.length > 0 ? (
        recommendation.reasons.map((r) => <Reason key={r}>• {r}</Reason>)
      ) : (
        <Reason>Keine besonderen Wetter-Hinweise — mildes Wetter erwartet.</Reason>
      )}

      {onApplyCondition && recommended.length > 0 && (
        <Chips style={{ marginTop: 2 }}>
          {recommended.map((key) => {
            const active = activeConditions.includes(key);
            return (
              <Chip
                key={key}
                type="button"
                $active={active}
                onClick={() => !active && onApplyCondition(key)}
                title={active ? "bereits ausgewählt" : "Bedingung übernehmen"}
              >
                {active ? <Check size={13} /> : <Plus size={13} />}
                {conditionEmoji(key)} {conditionLabel(key, [])}
              </Chip>
            );
          })}
        </Chips>
      )}
    </Panel>
  );
}
