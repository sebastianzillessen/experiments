import { styled } from "next-yak";
import { colors, radii } from "../../theme.yak";

export const Chip = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: ${radii.pill};
  border: 1px solid ${({ $active }) => ($active ? colors.primary : colors.line2)};
  background: ${({ $active }) => ($active ? colors.primarySoft : colors.surface)};
  color: ${({ $active }) => ($active ? colors.primaryInk : colors.ink2)};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  white-space: nowrap;
  transition: background 100ms, color 100ms, border-color 100ms;
  &:hover {
    background: ${({ $active }) => ($active ? colors.primarySoft : colors.surface2)};
  }
`;

export const Chips = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

export const ChipsScrollable = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 2px 16px;
  margin: 0 -16px;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
  & > * {
    scroll-snap-align: start;
  }
`;
