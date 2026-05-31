import { styled } from "next-yak";
import { colors, radii } from "../../theme.yak";

export const Input = styled.input`
  border: 1px solid ${colors.line2};
  background: ${colors.surface};
  padding: 10px 12px;
  border-radius: ${radii.sm};
  width: 100%;
  &::placeholder {
    color: ${colors.ink3};
  }
`;

export const Textarea = styled.textarea`
  border: 1px solid ${colors.line2};
  background: ${colors.surface};
  padding: 10px 12px;
  border-radius: ${radii.sm};
  width: 100%;
  min-height: 80px;
  resize: vertical;
  font: inherit;
  &::placeholder {
    color: ${colors.ink3};
  }
`;

export const Select = styled.select`
  border: 1px solid ${colors.line2};
  background: ${colors.surface};
  padding: 10px 12px;
  border-radius: ${radii.sm};
  width: 100%;
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

export const FieldLabel = styled.span`
  font-size: 12px;
  color: ${colors.ink2};
  font-weight: 600;
`;

export const FieldHint = styled.span`
  font-size: 12px;
  color: ${colors.ink3};
`;
