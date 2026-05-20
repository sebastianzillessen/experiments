import { styled } from "next-yak";
import { formatInitials } from "../data/derive";

const Dot = styled.span<{ $color: string; $size: number }>`
  width: ${({ $size }) => `${$size}px`};
  height: ${({ $size }) => `${$size}px`};
  border-radius: 50%;
  background: ${({ $color }) => $color};
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: ${({ $size }) => `${Math.round($size * 0.42)}px`};
  flex-shrink: 0;
`;

interface Props {
  name: string;
  color?: string;
  size?: number;
}

export function AvatarDot({ name, color, size = 28 }: Props) {
  return (
    <Dot $color={color ?? "#8a92a3"} $size={size}>
      {formatInitials(name)}
    </Dot>
  );
}
