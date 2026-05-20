import { styled } from "next-yak";
import { Minus, Plus } from "lucide-react";
import { colors, radii } from "../theme.yak";

const Wrap = styled.div`
  display: inline-flex;
  align-items: center;
  border: 1px solid ${colors.line2};
  border-radius: ${radii.sm};
  overflow: hidden;
  background: ${colors.surface};
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

const Qty = styled.div<{ $full?: boolean }>`
  min-width: 60px;
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
  return (
    <Wrap>
      <StepBtn aria-label="Weniger" onClick={dec} disabled={packed === 0}>
        <Minus size={16} />
      </StepBtn>
      <Qty $full={full} onClick={setFull} role="button" title="Alle">
        {packed}/{total}
      </Qty>
      <StepBtn aria-label="Mehr" onClick={inc} disabled={packed >= total}>
        <Plus size={16} />
      </StepBtn>
    </Wrap>
  );
}
