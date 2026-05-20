import { styled } from "next-yak";
import { Minus, Plus, CheckCheck } from "lucide-react";
import { colors, radii } from "../theme.yak";

const Wrap = styled.div`
  display: inline-flex;
  align-items: stretch;
  border: 1px solid ${colors.line2};
  border-radius: ${radii.sm};
  overflow: hidden;
  background: ${colors.surface};
  flex-shrink: 0;
`;

const StepBtn = styled.button`
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: ${colors.ink2};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:hover { background: ${colors.surface2}; }
  &:disabled { color: ${colors.ink3}; cursor: not-allowed; }
`;

const QtyBtn = styled.button<{ $full: boolean; $clickable: boolean }>`
  min-width: 60px;
  height: 44px;
  border: none;
  border-left: 1px solid ${colors.line};
  border-right: 1px solid ${colors.line};
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 2px 6px;
  cursor: ${({ $clickable }) => ($clickable ? "pointer" : "default")};
  color: ${({ $full }) => ($full ? colors.success : colors.ink)};
  &:hover {
    background: ${({ $clickable }) => ($clickable ? colors.surface2 : "transparent")};
  }
`;

const QtyNumber = styled.div`
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
`;

const QtyHint = styled.div`
  font-size: 9px;
  font-weight: 700;
  color: ${colors.success};
  display: inline-flex;
  align-items: center;
  gap: 2px;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

interface Props {
  packed: number;
  total: number;
  onChange: (next: number) => void;
}

export function QtyStepper({ packed, total, onChange }: Props) {
  const dec = () => onChange(Math.max(0, packed - 1));
  const inc = () => onChange(Math.min(total, packed + 1));
  const setFull = () => onChange(total);
  const full = packed >= total;
  // "Alle"-Hinweis nur sinnvoll, wenn mehr als 1 zu packen ist und noch
  // nicht alles eingepackt wurde.
  const showAllHint = total > 1 && !full;
  return (
    <Wrap>
      <StepBtn type="button" aria-label="Weniger" onClick={dec} disabled={packed === 0}>
        <Minus size={16} />
      </StepBtn>
      <QtyBtn
        type="button"
        $full={full}
        $clickable={showAllHint}
        onClick={() => { if (showAllHint) setFull(); }}
        aria-label={showAllHint ? `Alle ${total} einpacken` : `${packed} von ${total} gepackt`}
        disabled={!showAllHint && total === 1}
      >
        <QtyNumber>{packed}/{total}</QtyNumber>
        {showAllHint && (
          <QtyHint>
            <CheckCheck size={9} />
            Alle
          </QtyHint>
        )}
      </QtyBtn>
      <StepBtn type="button" aria-label="Mehr" onClick={inc} disabled={packed >= total}>
        <Plus size={16} />
      </StepBtn>
    </Wrap>
  );
}
