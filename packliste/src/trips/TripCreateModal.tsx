import { useEffect, useMemo, useState } from "react";
import { styled } from "next-yak";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Stack, Row, Muted, Note } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input, Field, FieldLabel } from "../components/ui/Input";
import { Chip, Chips } from "../components/ui/Chip";
import { Checkbox } from "../components/ui/Checkbox";
import { NumberStepper } from "../components/ui/NumberStepper";
import { useCurrentFamily } from "../hooks/useFamily";
import { useConditions } from "../hooks/useConditions";
import { usePackingItems } from "../hooks/usePackingItems";
import { useDataProvider } from "../data/DataProviderContext";
import type { Trip } from "../types";
import { conditionEmoji } from "../labels";
import { calculateQuantity, daysBetween, isItemRelevantForTrip } from "../data/derive";
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
  duplicateSource?: Trip | null;
  onClose: () => void;
}

function defaultDates(durationDays: number) {
  const start = new Date();
  start.setDate(start.getDate() + 14); // 2 weeks from now
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(0, durationDays - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function TripCreateModal({ duplicateSource, onClose }: Props) {
  const family = useCurrentFamily();
  const provider = useDataProvider();
  const conditions = useConditions(family?.id);
  const templates = usePackingItems(family?.id);
  const navigate = useNavigate();

  const seed = duplicateSource ?? null;
  const initial = useMemo(() => {
    if (seed) {
      return {
        name: `${seed.name} (Kopie)`,
        startDate: "",
        endDate: "",
        days: seed.durationDays,
        conds: [...seed.conditions],
        washer: seed.hasWasher,
        washInterval: seed.washIntervalDays ?? 3,
      };
    }
    const d = defaultDates(7);
    return {
      name: "",
      startDate: d.start,
      endDate: d.end,
      days: 7,
      conds: [] as string[],
      washer: false,
      washInterval: 3,
    };
  }, [seed]);

  const [name, setName] = useState(initial.name);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [days, setDays] = useState(initial.days);
  const [activeConds, setActiveConds] = useState<string[]>(initial.conds);
  const [hasWasher, setHasWasher] = useState(initial.washer);
  const [washInterval, setWashInterval] = useState(initial.washInterval);

  // When dates change, compute days
  useEffect(() => {
    const computed = daysBetween(startDate, endDate);
    if (computed !== undefined && computed > 0) setDays(computed);
  }, [startDate, endDate]);

  const tripPreview: Trip = {
    id: "preview",
    familyId: family?.id ?? "",
    name,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    durationDays: Math.max(1, days),
    conditions: activeConds,
    hasWasher,
    washIntervalDays: hasWasher ? washInterval : undefined,
    createdBy: "",
    createdAt: "",
  };

  const previewItems = templates.filter((i) => isItemRelevantForTrip(i, tripPreview));
  const previewCount = previewItems.length;
  const previewQty = previewItems.reduce(
    (s, i) => s + calculateQuantity(i, tripPreview),
    0,
  );

  function toggle(key: string) {
    setActiveConds((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  function submit() {
    if (!family) return;
    let newId: string;
    if (seed) {
      newId = provider.duplicateTrip(
        seed.id,
        name,
        days,
        startDate || undefined,
        endDate || undefined,
      );
      // Apply the new conditions / washer settings via updateTrip
      provider.updateTrip(newId, {
        conditions: activeConds,
        hasWasher,
        washIntervalDays: hasWasher ? washInterval : undefined,
      });
    } else {
      newId = provider.createTrip({
        familyId: family.id,
        name,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        durationDays: days,
        conditions: activeConds,
        hasWasher,
        washIntervalDays: hasWasher ? washInterval : undefined,
      });
    }
    onClose();
    navigate(`/trip/${newId}`);
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Sheet>
            <div style={{ position: "relative" }}>
              <Dialog.Title style={{ margin: "0 0 4px", fontSize: 18 }}>
                {seed ? "Trip duplizieren" : "Neuer Trip"}
              </Dialog.Title>
              <Dialog.Description asChild>
                <Muted style={{ display: "block", marginBottom: 12 }}>
                  Bedingungen wählen — die Packliste wird automatisch erstellt.
                </Muted>
              </Dialog.Description>
              <Dialog.Close asChild>
                <CloseBtn aria-label="Schließen"><X size={18} /></CloseBtn>
              </Dialog.Close>
            </div>

            <Stack $gap={10}>
              <Field>
                <FieldLabel>Trip-Name</FieldLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Italien · Sommerferien" autoFocus />
              </Field>
              <Row $gap={8}>
                <Field style={{ flex: 1 }}>
                  <FieldLabel>Anreise</FieldLabel>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Field>
                <Field style={{ flex: 1 }}>
                  <FieldLabel>Abreise</FieldLabel>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </Field>
              </Row>
              <Field>
                <FieldLabel>Anzahl Tage</FieldLabel>
                <NumberStepper value={days} onChange={setDays} min={1} max={365} ariaLabel="Anzahl Tage" />
              </Field>

              <div>
                <FieldLabel>Bedingungen</FieldLabel>
                <Chips style={{ marginTop: 6 }}>
                  {conditions.map((c) => (
                    <Chip
                      key={c.key}
                      type="button"
                      $active={activeConds.includes(c.key)}
                      onClick={() => toggle(c.key)}
                    >
                      {conditionEmoji(c.key)} {c.label}
                    </Chip>
                  ))}
                </Chips>
                <Muted style={{ display: "block", marginTop: 6 }}>
                  Items ohne Bedingung sind immer auf jedem Trip.
                </Muted>
              </div>

              <Checkbox
                checked={hasWasher}
                onChange={setHasWasher}
                label="🧺 Waschmaschine verfügbar"
                hint="Waschbare Items werden reduziert"
              />
              {hasWasher && (
                <Field>
                  <FieldLabel>Waschintervall (Tage)</FieldLabel>
                  <NumberStepper value={washInterval} onChange={setWashInterval} min={1} max={30} ariaLabel="Waschintervall in Tagen" />
                </Field>
              )}

              <Note>
                <strong>{previewCount}</strong> {previewCount === 1 ? "Item" : "Items"} ({previewQty} Stück) werden für diesen Trip vorbereitet.
              </Note>

              <Row $gap={8} style={{ marginTop: 4 }}>
                <Button $variant="ghost" onClick={onClose} style={{ flex: 1 }}>Abbrechen</Button>
                <Button onClick={submit} style={{ flex: 2 }} disabled={!family}>
                  {seed ? "Duplizieren" : "Trip anlegen"}
                </Button>
              </Row>
            </Stack>
          </Sheet>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
