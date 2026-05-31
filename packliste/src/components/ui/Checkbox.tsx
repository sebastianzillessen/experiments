import { styled, css } from "next-yak";
import { Check } from "lucide-react";
import { colors, radii } from "../../theme.yak";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

const Row = styled.label<{ $checked: boolean; $disabled: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: ${radii.sm};
  background: ${colors.surface};
  border: 1px solid ${({ $checked }) => ($checked ? colors.primary : colors.line)};
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  user-select: none;
  &:hover {
    ${({ $disabled }) =>
      !$disabled &&
      css`
        background: ${colors.surface2};
      `}
  }
`;

const Box = styled.span<{ $on: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 1.5px solid ${({ $on }) => ($on ? colors.primary : colors.line2)};
  background: ${({ $on }) => ($on ? colors.primary : colors.surface)};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const Label = styled.div`
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${colors.ink3};
  margin-top: 2px;
`;

const Hidden = styled.input`
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
`;

export function Checkbox({ checked, onChange, label, hint, disabled = false }: CheckboxProps) {
  return (
    <Row $checked={checked} $disabled={disabled}>
      <Hidden
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Box $on={checked}>{checked && <Check size={14} strokeWidth={3} />}</Box>
      <div style={{ flex: 1, minWidth: 0 }}>
        {label && <Label>{label}</Label>}
        {hint && <Hint>{hint}</Hint>}
      </div>
    </Row>
  );
}
