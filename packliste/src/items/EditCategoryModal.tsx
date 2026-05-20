import { useState } from "react";
import { styled } from "next-yak";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Stack, Row, Muted } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input, Field, FieldLabel, FieldHint } from "../components/ui/Input";
import { useDataProvider } from "../data/DataProviderContext";
import type { Category } from "../types";
import { colors, radii, shadows } from "../theme.yak";

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 100;
`;

const Content = styled(Dialog.Content)`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 101;
  padding: 12px;
  pointer-events: none;
  @media (min-width: 600px) {
    align-items: center;
  }
  & > * { pointer-events: auto; }
`;

const Sheet = styled.div`
  background: ${colors.surface};
  border-radius: ${radii.md};
  padding: 18px;
  width: 100%;
  max-width: 460px;
  max-height: 90dvh;
  overflow-y: auto;
  box-shadow: ${shadows.md};
  position: relative;
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  color: ${colors.ink3};
  padding: 4px;
`;

const EmojiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  margin-top: 6px;
`;

const EmojiBtn = styled.button<{ $selected: boolean }>`
  height: 44px;
  border-radius: ${radii.sm};
  border: 2px solid ${({ $selected }) => ($selected ? colors.primary : "transparent")};
  background: ${({ $selected }) => ($selected ? colors.primarySoft : colors.surface2)};
  font-size: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  &:hover { background: ${colors.primarySoft}; }
`;

/** Kuratiertes Emoji-Set für gängige Familien-Packlisten-Kategorien. */
const EMOJI_SET = [
  "👕", "👖", "👗", "🧦", "👞", "👟", "🥾", "🩴",
  "🧥", "🥽", "🕶️", "🧢", "🎩", "🧤", "🧣", "👒",
  "🧴", "🧼", "🪥", "🧻", "💊", "🩹", "🧴", "🪒",
  "🎒", "🧳", "👜", "👛", "💼", "🛍️", "🪪", "📄",
  "📱", "💻", "🔌", "🔋", "📷", "🎧", "🔦", "⌚",
  "📚", "📖", "✏️", "🎮", "🧸", "🪀", "🎨", "🪁",
  "☂️", "🌂", "🧴", "🪪", "🏕️", "🧗", "🚴", "🏊",
  "🍽️", "🥤", "🧃", "🍫", "🐾", "🐕", "🐈", "🦴",
];

interface Props {
  category: Category;
  onClose: () => void;
}

export function EditCategoryModal({ category, onClose }: Props) {
  const provider = useDataProvider();
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon ?? "🏷️");

  function save() {
    if (!name.trim()) return;
    provider.updateCategory(category.id, { name: name.trim(), icon: icon.trim() || "🏷️" });
    onClose();
  }

  function remove() {
    if (
      confirm(
        `Kategorie "${category.name}" löschen? Items dieser Kategorie werden zu "Sonstiges".`,
      )
    ) {
      provider.deleteCategory(category.id);
      onClose();
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Sheet>
            <Dialog.Title style={{ margin: "0 0 4px", fontSize: 18 }}>Kategorie bearbeiten</Dialog.Title>
            <Dialog.Description asChild>
              <Muted style={{ display: "block", marginBottom: 12 }}>
                Beim Umbenennen werden alle Items dieser Kategorie automatisch aktualisiert.
              </Muted>
            </Dialog.Description>
            <Dialog.Close asChild>
              <CloseBtn aria-label="Schließen"><X size={18} /></CloseBtn>
            </Dialog.Close>

            <Stack $gap={12}>
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder="z.B. Kleidung"
                  onKeyDown={(e) => e.key === "Enter" && save()}
                />
              </Field>

              <div>
                <FieldLabel>Icon</FieldLabel>
                <Row $gap={8} style={{ marginTop: 4 }}>
                  <Input
                    value={icon}
                    onChange={(e) => setIcon(e.target.value.slice(0, 2))}
                    maxLength={2}
                    style={{ width: 80, textAlign: "center", fontSize: 22 }}
                    aria-label="Aktuelles Icon (frei eingeben)"
                  />
                  <FieldHint style={{ alignSelf: "center" }}>
                    Eines aus dem Raster wählen oder selber tippen.
                  </FieldHint>
                </Row>
                <EmojiGrid>
                  {Array.from(new Set(EMOJI_SET)).map((e) => (
                    <EmojiBtn
                      key={e}
                      type="button"
                      $selected={icon === e}
                      onClick={() => setIcon(e)}
                      aria-label={e}
                    >
                      {e}
                    </EmojiBtn>
                  ))}
                </EmojiGrid>
              </div>

              <Row $gap={8}>
                <Button $variant="danger" $size="sm" onClick={remove}>
                  Löschen
                </Button>
                <div style={{ flex: 1 }} />
                <Button $variant="ghost" onClick={onClose}>Abbrechen</Button>
                <Button onClick={save} disabled={!name.trim()}>Speichern</Button>
              </Row>
            </Stack>
          </Sheet>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
