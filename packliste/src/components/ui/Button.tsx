import { styled, css } from "next-yak";
import { colors, radii } from "../../theme.yak";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const variantStyles = {
  primary: css`
    background: ${colors.primary};
    color: white;
    border-color: ${colors.primary};
    &:hover { filter: brightness(0.95); }
  `,
  secondary: css`
    background: ${colors.surface};
    color: ${colors.primary};
    border-color: ${colors.line2};
    &:hover { background: ${colors.surface2}; }
  `,
  ghost: css`
    background: transparent;
    color: ${colors.ink2};
    border-color: transparent;
    &:hover { background: ${colors.surface2}; }
  `,
  danger: css`
    background: ${colors.surface};
    color: ${colors.danger};
    border-color: ${colors.line2};
    &:hover { background: ${colors.dangerSoft}; border-color: ${colors.danger}; }
  `,
};

const sizeStyles = {
  md: css`
    padding: 11px 16px;
    font-size: 14px;
  `,
  sm: css`
    padding: 6px 10px;
    font-size: 13px;
  `,
};

export const Button = styled.button<{ $variant?: Variant; $size?: Size; $block?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: ${radii.sm};
  font-weight: 600;
  white-space: nowrap;
  transition: filter 100ms, background 100ms, border-color 100ms;
  width: ${({ $block }) => ($block ? "100%" : "auto")};

  ${({ $variant }) => variantStyles[$variant ?? "primary"]}
  ${({ $size }) => sizeStyles[$size ?? "md"]}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const IconButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid ${colors.line};
  background: ${colors.surface};
  color: ${colors.ink2};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:hover { background: ${colors.surface2}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;
