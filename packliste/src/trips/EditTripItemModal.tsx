import { useState } from "react";
import { styled } from "next-yak";
import * as Dialog from "@radix-ui/react-dialog";
import { X, RotateCcw } from "lucide-react";
import { NumberStepper } from "../components/ui/NumberStepper";
import { Button } from "../components/ui/Button";
import { Muted, Stack, Row } from "../components/ui/Layout";
import { useDataProvider } from "../data/DataProviderContext";
import { calculateQuantity } from "../data/derive";
import type { Trip, TripItem } from "../types";
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

const ResetBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  color: ${colors.accent};
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

interface Props {
  item: TripItem;
  trip: Trip;
  onClose: () => void;
}

export function EditTripItemModal({ item, trip, onClose }: Props) {
  const provider = useDataProvider();
  const [qty, setQty] = useState(item.quantity);

  // Automatisch berechnete Menge (aus Nächten/baseQuantity/Wasch-Logik) als
  // Referenz — der Nutzer kann via "Zurücksetzen" dorthin zurückspringen.
  const recommended = calculateQuantity(
    {
      baseQuantity: item.baseQuantity,
      unit: item.unit,
      washable: item.washable,
      perDays: item.perDays,
    },
    trip,
  );

  function save() {
    provider.updateTripItem(item.id, { quantity: Math.max(1, qty) });
    onClose();
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Sheet>
            <Dialog.Title style={{ margin: "0 0 4px", fontSize: 18 }}>{item.name}</Dialog.Title>
            <Dialog.Description asChild>
              <Muted style={{ display: "block", marginBottom: 14 }}>
                Anzahl für diesen Trip anpassen.
              </Muted>
            </Dialog.Description>
            <Dialog.Close asChild>
              <CloseBtn aria-label="Schließen"><X size={18} /></CloseBtn>
            </Dialog.Close>

            <Stack $gap={10}>
              <NumberStepper value={qty} onChange={setQty} min={1} ariaLabel="Anzahl" />
              {qty !== recommended && (
                <Row $gap={6} style={{ fontSize: 13 }}>
                  <Muted>Empfohlen: {recommended}</Muted>
                  <span style={{ color: colors.ink3 }}>·</span>
                  <ResetBtn type="button" onClick={() => setQty(recommended)}>
                    <RotateCcw size={13} /> Zurücksetzen
                  </ResetBtn>
                </Row>
              )}
              <Button $block onClick={save}>Speichern</Button>
            </Stack>
          </Sheet>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
