import { useEffect, useState } from "react";
import { styled } from "next-yak";
import { Minus, Plus } from "lucide-react";
import { colors, radii } from "../../theme.yak";

const Wrap = styled.div`
  display: flex;
  align-items: stretch;
  border: 1px solid ${colors.line2};
  border-radius: ${radii.sm};
  background: ${colors.surface};
  overflow: hidden;
  height: 44px;
  width: 100%;
  min-width: 0;
  max-width: 200px;
`;

const StepBtn = styled.button`
  width: 44px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: ${colors.ink2};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:hover { background: ${colors.surface2}; }
  &:disabled { color: ${colors.ink3}; cursor: not-allowed; }
`;

const NumInput = styled.input`
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  text-align: center;
  border: none;
  border-left: 1px solid ${colors.line};
  border-right: 1px solid ${colors.line};
  background: transparent;
  font: inherit;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  /** Tastatur-Eingabe deaktivieren — nur via Buttons */
  readOnlyInput?: boolean;
}

/**
 * Number stepper mit −/+ Buttons und (per default) tippbarer Mitte.
 * Erlaubt das Feld kurz leer zu sein während der Tastatur-Eingabe;
 * beim Blur wird ein gültiger Wert sichergestellt.
 */
export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  ariaLabel,
  readOnlyInput = false,
}: Props) {
  const [text, setText] = useState(String(value));

  // Sync internal text with controlled value when value changes externally
  // (z.B. nach Submit oder externem Reset).
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const dec = () => {
    const next = Math.max(min, value - step);
    onChange(next);
  };
  const inc = () => {
    const next = Math.min(max, value + step);
    onChange(next);
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v);
    // Nur committen wenn die Eingabe eine gültige Zahl im Range ist
    if (v === "" || v === "-") return;
    const n = Number(v);
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
  }

  function handleBlur() {
    if (text === "" || text === "-") {
      // Leer-Eingabe: auf min zurücksetzen
      setText(String(min));
      onChange(min);
      return;
    }
    const n = Number(text);
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <Wrap>
      <StepBtn type="button" aria-label="weniger" onClick={dec} disabled={value <= min}>
        <Minus size={16} />
      </StepBtn>
      <NumInput
        type="number"
        inputMode="numeric"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        readOnly={readOnlyInput}
        aria-label={ariaLabel}
      />
      <StepBtn type="button" aria-label="mehr" onClick={inc} disabled={value >= max}>
        <Plus size={16} />
      </StepBtn>
    </Wrap>
  );
}
