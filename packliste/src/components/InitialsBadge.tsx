import { styled } from "next-yak";
import type { Person } from "../types";
import { personInitials } from "../data/derive";
import { colors } from "../theme.yak";

const Pill = styled.span<{ $color: string }>`
  background: ${({ $color }) => $color};
  color: white;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-variant: small-caps;
  min-width: 22px;
  line-height: 1.4;
  flex-shrink: 0;
`;

interface Props {
  person: Pick<Person, "name" | "color" | "initials">;
  title?: string;
}

export function InitialsBadge({ person, title }: Props) {
  return (
    <Pill $color={person.color ?? colors.ink3} title={title ?? person.name}>
      {personInitials(person)}
    </Pill>
  );
}

/** Variante für "Gemeinsam" (kein Person zugewiesen). */
export function SharedBadge({ label = "Alle" }: { label?: string }) {
  return <Pill $color={colors.ink3}>{label}</Pill>;
}
