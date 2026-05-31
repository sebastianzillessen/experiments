import { styled } from "next-yak";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ItemForm, type ItemFormValues } from "./ItemForm";
import { useCurrentFamily } from "../hooks/useFamily";
import { useConditions } from "../hooks/useConditions";
import { usePersons } from "../hooks/usePersons";
import { usePackingItems } from "../hooks/usePackingItems";
import { useDataProvider } from "../data/DataProviderContext";
import { Muted } from "../components/ui/Layout";
import type { PackingItem } from "../types";
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
  & > * {
    pointer-events: auto;
  }
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

interface Props {
  item: PackingItem;
  onClose: () => void;
}

export function EditItemModal({ item, onClose }: Props) {
  const family = useCurrentFamily();
  const provider = useDataProvider();
  const persons = usePersons(family?.id);
  const conditions = useConditions(family?.id);
  const allItems = usePackingItems(family?.id);
  const categories = Array.from(new Set(allItems.map((i) => i.category).filter(Boolean))).sort();

  if (!family) return null;

  function save(values: ItemFormValues) {
    provider.updatePackingItem(item.id, {
      name: values.name,
      category: values.category,
      personIds: values.personIds,
      baseQuantity: values.baseQuantity,
      unit: values.unit,
      perDays: values.perDays,
      washable: values.washable,
      conditions: values.conditions,
    });
    onClose();
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Sheet>
            <Dialog.Title style={{ margin: "0 0 4px", fontSize: 18 }}>Item bearbeiten</Dialog.Title>
            <Dialog.Description asChild>
              <Muted style={{ display: "block", marginBottom: 12 }}>
                Änderungen wirken sich nur auf neue Trips aus, nicht auf bereits angelegte.
              </Muted>
            </Dialog.Description>
            <Dialog.Close asChild>
              <CloseBtn aria-label="Schließen"><X size={18} /></CloseBtn>
            </Dialog.Close>

            <ItemForm
              familyId={family.id}
              persons={persons}
              conditions={conditions}
              categories={categories}
              initial={item}
              submitLabel="Speichern"
              onSubmit={save}
              onCancel={onClose}
              showPersonMultiHint={false}
            />
          </Sheet>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
