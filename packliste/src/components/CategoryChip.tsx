import { styled } from "next-yak";
import { colors } from "../theme.yak";

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: ${colors.ink2};
  background: ${colors.surface2};
  padding: 3px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Label = styled.span`
  font-weight: 500;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Auf Mobile nur das Icon */
  @media (max-width: 600px) {
    display: none;
  }
`;

interface Props {
  icon: string;
  label?: string;
}

export function CategoryChip({ icon, label }: Props) {
  return (
    <Chip title={label ?? "Kategorie"}>
      <span aria-hidden>{icon}</span>
      {label && <Label>{label}</Label>}
    </Chip>
  );
}
