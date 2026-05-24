import { styled } from "next-yak";
import { colors, radii, shadows } from "../../theme.yak";

export const Card = styled.div`
  background: ${colors.surface};
  border: 1px solid ${colors.line};
  border-radius: ${radii.md};
  padding: 14px;
  box-shadow: ${shadows.sm};
`;

export const CardTitle = styled.h3`
  font-size: 14px;
  margin: 0 0 10px;
  color: ${colors.ink2};
  font-weight: 600;
  letter-spacing: 0.01em;
`;

export const Stack = styled.div<{ $gap?: number; $align?: "stretch" | "center" | "start" }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => `${$gap ?? 12}px`};
  align-items: ${({ $align }) => $align ?? "stretch"};
`;

export const Row = styled.div<{ $gap?: number; $wrap?: boolean; $align?: "center" | "baseline" | "start" | "end" }>`
  display: flex;
  gap: ${({ $gap }) => `${$gap ?? 8}px`};
  align-items: ${({ $align }) => $align ?? "center"};
  flex-wrap: ${({ $wrap }) => ($wrap ? "wrap" : "nowrap")};
`;

export const Spread = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

export const Muted = styled.span`
  color: ${colors.ink3};
  font-size: 12px;
`;

export const SectionLabel = styled.div`
  font-size: 12px;
  color: ${colors.ink3};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  padding: 12px 4px 4px;
`;

export const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${colors.line};
  margin: 10px 0;
`;

export const Badge = styled.span<{ $tone?: "primary" | "warn" | "success" | "accent" | "neutral" }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: ${({ $tone }) => {
    switch ($tone) {
      case "warn": return colors.accentSoft;
      case "success": return colors.successSoft;
      case "accent": return colors.accentSoft;
      case "neutral": return colors.surface2;
      default: return colors.primarySoft;
    }
  }};
  color: ${({ $tone }) => {
    switch ($tone) {
      case "warn": return "#884420";
      case "success": return colors.success;
      case "accent": return "#884420";
      case "neutral": return colors.ink2;
      default: return colors.primaryInk;
    }
  }};
`;

export const Note = styled.div`
  background: ${colors.accentSoft};
  border: 1px solid ${colors.accent};
  border-radius: ${radii.sm};
  padding: 10px 12px;
  color: #6b3a1a;
  font-size: 13px;
`;

export const ProgressTrack = styled.div`
  height: 8px;
  background: ${colors.line};
  border-radius: 4px;
  overflow: hidden;
`;

export const ProgressBar = styled.div<{ $pct: number; $success?: boolean }>`
  height: 100%;
  width: ${({ $pct }) => `${Math.max(0, Math.min(100, $pct))}%`};
  background: ${({ $success }) => ($success ? colors.success : colors.primary)};
  transition: width 250ms;
`;
