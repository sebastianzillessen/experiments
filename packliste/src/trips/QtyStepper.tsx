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

const AllBtn = styled.button`
  height: 44px;
  padding: 0 10px;
  border: none;
  border-left: 1px solid ${colors.line};
  background: transparent;
  color: ${colors.success};
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  &:hover { background: ${colors.successSoft}; }
`;

const Qty = styled.div<{ $full?: boolean }>`
  min-width: 56px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  border-left: 1px solid ${colors.line};
  border-right: 1px solid ${colors.line};
  padding: 0 10px;
  line-height: 44px;
  color: ${({ $full }) => ($full ? colors.success : colors.ink)};
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
  // "Alle"-Button nur sinnvoll, wenn mehr als 1 zu packen ist und noch
  // nicht alles eingepackt wurde. Spart das 4-mal-Tappen für 4 Boxershorts.
  const showAll = total > 1 && !full;
  return (
    <Wrap>
      <StepBtn type="button" aria-label="Weniger" onClick={dec} disabled={packed === 0}>
        <Minus size={16} />
      </StepBtn>
      <Qty $full={full}>
        {packed}/{total}
      </Qty>
      <StepBtn type="button" aria-label="Mehr" onClick={inc} disabled={packed >= total}>
        <Plus size={16} />
      </StepBtn>
      {showAll && (
        <AllBtn type="button" aria-label={`Alle ${total} einpacken`} onClick={setFull}>
          <CheckCheck size={14} />
          Alle
        </AllBtn>
      )}
    </Wrap>
  );
}
