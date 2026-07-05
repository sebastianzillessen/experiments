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
import { usePersons } from "../hooks/usePersons";
import { useDataProvider } from "../data/DataProviderContext";
import type { Trip } from "../types";
import { conditionEmoji } from "../labels";
import { daysBetween, generateTripItems } from "../data/derive";
import { useTripWeather } from "../weather/useTripWeather";
import { WeatherHint } from "../weather/WeatherHint";
import { detectPlaceFromName } from "../weather/suggest";
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

const PersonDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  display: inline-block;
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
  const persons = usePersons(family?.id);
  const navigate = useNavigate();

  const seed = duplicateSource ?? null;
  const initial = useMemo(() => {
    if (seed) {
      return {
        name: `${seed.name} (Kopie)`,
        startDate: "",
        endDate: "",
        days: seed.durationDays,
        destination: seed.destination ?? "",
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
      destination: "",
      // "default" ist vorausgewählt — Standard-Items kommen automatisch
      // mit. Spezial-Conditions (Regen, Schwimmen, …) wählt der User
      // gezielt zusätzlich.
      conds: ["default"] as string[],
      washer: false,
      washInterval: 3,
    };
  }, [seed]);

  // Default: alle Familienmitglieder reisen mit. Beim Duplizieren die
  // Auswahl des Quell-Trips übernehmen (fällt auf "alle" zurück, wenn der
  // Quell-Trip noch keine gespeicherte Auswahl hat).
  const initialPersonIds = useMemo(
    () => (seed?.personIds ? [...seed.personIds] : persons.map((p) => p.id)),
    [seed, persons],
  );

  const [name, setName] = useState(initial.name);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [days, setDays] = useState(initial.days);
  const [destination, setDestination] = useState(initial.destination);
  // Solange der Nutzer das Reiseziel nicht manuell angefasst hat, wird es aus
  // dem Trip-Namen abgeleitet. Beim Duplizieren bleibt das Quell-Ziel stehen.
  const [destinationTouched, setDestinationTouched] = useState(!!seed);
  const [activeConds, setActiveConds] = useState<string[]>(initial.conds);
  const [hasWasher, setHasWasher] = useState(initial.washer);
  const [washInterval, setWashInterval] = useState(initial.washInterval);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(initialPersonIds);

  const allPersonsSelected =
    persons.length > 0 && persons.every((p) => selectedPersonIds.includes(p.id));

  // When dates change, compute days
  useEffect(() => {
    const computed = daysBetween(startDate, endDate);
    if (computed !== undefined && computed > 0) setDays(computed);
  }, [startDate, endDate]);

  // Reiseziel automatisch aus dem Namen ableiten, bis der Nutzer es editiert.
  useEffect(() => {
    if (destinationTouched) return;
    setDestination(detectPlaceFromName(name));
  }, [name, destinationTouched]);

  const weather = useTripWeather(destination, startDate, endDate);

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
    personIds: selectedPersonIds,
    createdBy: "",
    createdAt: "",
  };

  // Über generateTripItems berechnen, damit die Vorschau die 1:N-
  // Aufteilung pro Person und die Mitreisenden-Auswahl berücksichtigt.
  const previewItems = generateTripItems(templates, tripPreview);
  const previewCount = previewItems.length;
  const previewQty = previewItems.reduce((s, i) => s + i.quantity, 0);

  function toggle(key: string) {
    setActiveConds((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  function togglePerson(id: string) {
    setSelectedPersonIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleAllPersons() {
    setSelectedPersonIds(allPersonsSelected ? [] : persons.map((p) => p.id));
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
        selectedPersonIds,
      );
      // Apply the new conditions / washer settings via updateTrip
      provider.updateTrip(newId, {
        destination: destination.trim() || undefined,
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
        destination: destination.trim() || undefined,
        conditions: activeConds,
        hasWasher,
        washIntervalDays: hasWasher ? washInterval : undefined,
        personIds: selectedPersonIds,
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
              <Field>
                <FieldLabel>Reiseziel (optional)</FieldLabel>
                <Input
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setDestinationTouched(true);
                  }}
                  placeholder="z.B. Sardinien — für die Wettervorhersage"
                />
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

              {persons.length > 0 && (
                <div>
                  <FieldLabel>Wer reist mit?</FieldLabel>
                  <Chips style={{ marginTop: 6 }}>
                    <Chip
                      type="button"
                      $active={allPersonsSelected}
                      onClick={toggleAllPersons}
                    >
                      Alle
                    </Chip>
                    {persons.map((p) => (
                      <Chip
                        key={p.id}
                        type="button"
                        $active={selectedPersonIds.includes(p.id)}
                        onClick={() => togglePerson(p.id)}
                      >
                        <PersonDot $color={p.color ?? colors.ink3} />
                        {p.name}{p.isPet && " 🐾"}
                      </Chip>
                    ))}
                  </Chips>
                  <Muted style={{ display: "block", marginTop: 6 }}>
                    Nur Items der mitreisenden Personen kommen auf die Liste.
                    Gemeinsame Items sind immer dabei.
                  </Muted>
                </div>
              )}

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

              <WeatherHint
                weather={weather}
                activeConditions={activeConds}
                onApplyCondition={(key) => {
                  if (!activeConds.includes(key)) toggle(key);
                }}
              />

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
