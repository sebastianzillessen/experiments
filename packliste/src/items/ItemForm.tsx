import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { X, Lightbulb } from "lucide-react";
import { Stack, Row, Muted } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input, Field, FieldLabel, FieldHint } from "../components/ui/Input";
import { Chip, Chips } from "../components/ui/Chip";
import { Checkbox } from "../components/ui/Checkbox";
import { NumberStepper } from "../components/ui/NumberStepper";
import { calculateQuantity, fuzzyMatchCategory } from "../data/derive";
import { useDataProvider } from "../data/DataProviderContext";
import type { Condition, PackingItem, Person, QuantityUnit } from "../types";
import { conditionEmoji } from "../labels";
import { colors } from "../theme.yak";

const PersonDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  display: inline-block;
`;

const CategorySuggestion = styled.button`
  margin-top: 6px;
  background: ${colors.accentSoft};
  border: 1px solid ${colors.accent};
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #6b3a1a;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  cursor: pointer;
  &:hover { filter: brightness(0.97); }
`;

type Frequency = "per_trip" | "daily" | "every_n";

export interface ItemFormValues {
  name: string;
  category: string;
  baseQuantity: number;
  unit: QuantityUnit;
  perDays?: number;
  washable: boolean;
  personIds: string[];
  conditions: string[];
}

function pickFrequency(item: Pick<PackingItem, "unit" | "perDays">): Frequency {
  if (item.unit === "per_trip") return "per_trip";
  if ((item.perDays ?? 1) === 1) return "daily";
  return "every_n";
}

interface Props {
  familyId: string;
  persons: Person[];
  conditions: Condition[];
  categories: string[];
  initial?: Partial<PackingItem>;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => void;
  onCancel?: () => void;
  /** Multi-Person-Hinweis nur in "Neues Item"-Modus zeigen (in Edit nicht relevant). */
  showPersonMultiHint?: boolean;
}

export function ItemForm({
  familyId,
  persons,
  conditions,
  categories,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  showPersonMultiHint = true,
}: Props) {
  const provider = useDataProvider();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [baseQuantity, setBaseQuantity] = useState(initial?.baseQuantity ?? 1);
  const [frequency, setFrequency] = useState<Frequency>(
    initial ? pickFrequency({ unit: initial.unit ?? "per_trip", perDays: initial.perDays }) : "per_trip",
  );
  const [perDays, setPerDays] = useState(initial?.perDays ?? 3);
  const [washable, setWashable] = useState(initial?.washable ?? false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(initial?.personIds ?? []);
  // Neue Items bekommen "default" vorausgewählt (= Standard-Item). Beim
  // Edit verwenden wir die gespeicherten Conditions ungeändert.
  const [activeConds, setActiveConds] = useState<string[]>(
    initial?.conditions ?? ["default"],
  );
  const [newCondition, setNewCondition] = useState("");
  const [showCustomConditionForm, setShowCustomConditionForm] = useState(false);

  const categoryFuzzy = useMemo(
    () => fuzzyMatchCategory(category, categories),
    [category, categories],
  );

  function toggleCond(key: string) {
    setActiveConds((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  function togglePerson(id: string) {
    setSelectedPersonIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleAllPersons() {
    // "Alle Personen" zielt auf Menschen, nicht auf Haustiere — Haustiere
    // müssen explizit ausgewählt werden. Toggle: wenn alle Nicht-Pets
    // gewählt sind, dann deselektieren; sonst alle Nicht-Pets selektieren
    // (vorhandene Pet-Auswahl bleibt erhalten).
    const humanIds = persons.filter((p) => !p.isPet).map((p) => p.id);
    const allHumansSelected =
      humanIds.length > 0 && humanIds.every((id) => selectedPersonIds.includes(id));
    if (allHumansSelected) {
      setSelectedPersonIds((prev) => prev.filter((id) => !humanIds.includes(id)));
    } else {
      setSelectedPersonIds((prev) => Array.from(new Set([...prev, ...humanIds])));
    }
  }

  function addCustomCondition() {
    if (!newCondition.trim()) return;
    provider.createCustomCondition(familyId, newCondition.trim());
    setNewCondition("");
    setShowCustomConditionForm(false);
  }

  const previewQty = (() => {
    const sampleDays = 7;
    const sampleNights = sampleDays - 1;
    if (frequency === "per_trip") return `Pro Trip = ${baseQuantity} Stück`;
    // Mengen werden pro Übernachtung gerechnet (siehe calculateQuantity).
    // Wir nutzen dieselbe Funktion, damit die Vorschau exakt zum Ergebnis passt.
    const resolvedPerDays = frequency === "daily" ? 1 : Math.max(1, perDays);
    const qty = calculateQuantity(
      { baseQuantity, unit: "per_day", washable, perDays: resolvedPerDays },
      { durationDays: sampleDays, hasWasher: false },
    );
    if (frequency === "daily")
      return `Bei ${sampleDays}-Tage-Trip (${sampleNights} Nächte) = ${qty} Stück (täglich)`;
    return `Bei ${sampleDays}-Tage-Trip (${sampleNights} Nächte) = ${qty} Stück (alle ${resolvedPerDays} Tage, aufgerundet)`;
  })();

  function submit() {
    if (!name.trim()) return;
    let unit: QuantityUnit;
    let resolvedPerDays: number | undefined;
    if (frequency === "per_trip") {
      unit = "per_trip";
      resolvedPerDays = undefined;
    } else if (frequency === "daily") {
      unit = "per_day";
      resolvedPerDays = 1;
    } else {
      unit = "per_day";
      resolvedPerDays = Math.max(1, perDays);
    }
    const trimmedCategory = category.trim();
    const fuzzy = trimmedCategory ? fuzzyMatchCategory(trimmedCategory, categories) : null;
    const finalCategory = fuzzy ?? trimmedCategory;
    onSubmit({
      name: name.trim(),
      category: finalCategory,
      baseQuantity: Math.max(1, baseQuantity),
      unit,
      perDays: resolvedPerDays,
      washable,
      personIds: [...selectedPersonIds],
      conditions: [...activeConds],
    });
  }

  const personHint = (() => {
    if (!showPersonMultiHint) return null;
    if (selectedPersonIds.length === 0) return "Niemand ausgewählt → 1 gemeinsames Item für die Familie.";
    if (selectedPersonIds.length === 1) return "1 Item für die gewählte Person.";
    return `Für ${selectedPersonIds.length} Personen — beim Trip-Anlegen wird pro Person eine Zeile erstellt.`;
  })();

  return (
    <Stack $gap={10}>
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Unterhose" autoFocus />
      </Field>
      <Field>
        <FieldLabel>Kategorie</FieldLabel>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="z.B. Kleidung"
          list="cat-list"
        />
        <datalist id="cat-list">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
        {categoryFuzzy && (
          <CategorySuggestion type="button" onClick={() => setCategory(categoryFuzzy)}>
            <Lightbulb size={12} /> Meinst du <strong>{categoryFuzzy}</strong>? · Klick zum Übernehmen
          </CategorySuggestion>
        )}
      </Field>
      {persons.length > 0 && (
        <div>
          <FieldLabel>Für wen? (Mehrfach-Auswahl)</FieldLabel>
          <Chips style={{ marginTop: 6 }}>
            {persons.some((p) => !p.isPet) && (
              <Chip
                type="button"
                $active={persons
                  .filter((p) => !p.isPet)
                  .every((p) => selectedPersonIds.includes(p.id))}
                onClick={toggleAllPersons}
              >
                Alle Personen
              </Chip>
            )}
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
          {personHint && (
            <FieldHint style={{ display: "block", marginTop: 6 }}>{personHint}</FieldHint>
          )}
        </div>
      )}
      <Row $gap={8} $wrap>
        <Field style={{ flex: "1 1 140px", minWidth: 0 }}>
          <FieldLabel>Grundmenge</FieldLabel>
          <NumberStepper value={baseQuantity} onChange={setBaseQuantity} min={1} ariaLabel="Grundmenge" />
        </Field>
        {frequency === "every_n" && (
          <Field style={{ flex: "1 1 140px", minWidth: 0 }}>
            <FieldLabel>Alle X Tage</FieldLabel>
            <NumberStepper value={perDays} onChange={setPerDays} min={1} max={365} ariaLabel="Tages-Intervall" />
          </Field>
        )}
      </Row>
      <div>
        <FieldLabel>Häufigkeit</FieldLabel>
        <Chips style={{ marginTop: 6 }}>
          <Chip type="button" $active={frequency === "per_trip"} onClick={() => setFrequency("per_trip")}>
            Pro Trip
          </Chip>
          <Chip type="button" $active={frequency === "daily"} onClick={() => setFrequency("daily")}>
            Pro Tag
          </Chip>
          <Chip type="button" $active={frequency === "every_n"} onClick={() => setFrequency("every_n")}>
            Alle X Tage
          </Chip>
        </Chips>
        <FieldHint style={{ display: "block", marginTop: 6 }}>{previewQty}</FieldHint>
      </div>
      <Checkbox checked={washable} onChange={setWashable} label="🧺 Waschbar" hint="Wird auf Trips mit Waschmaschine reduziert" />
      <div>
        <FieldLabel>Bedingungen</FieldLabel>
        <Chips style={{ marginTop: 6 }}>
          {conditions.map((c) => (
            <Chip
              key={c.key}
              type="button"
              $active={activeConds.includes(c.key)}
              onClick={() => toggleCond(c.key)}
            >
              {conditionEmoji(c.key)} {c.label}
              {c.isCustom && (
                <X
                  size={12}
                  style={{ marginLeft: 2, cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Bedingung "${c.label}" löschen?`)) {
                      provider.deleteCustomCondition(familyId, c.key);
                    }
                  }}
                />
              )}
            </Chip>
          ))}
          {!showCustomConditionForm && (
            <Chip type="button" onClick={() => setShowCustomConditionForm(true)}>+ Eigene</Chip>
          )}
        </Chips>
        {showCustomConditionForm && (
          <Row $gap={6} style={{ marginTop: 8 }}>
            <Input
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
              placeholder="z.B. Mit Hund"
              onKeyDown={(e) => e.key === "Enter" && addCustomCondition()}
            />
            <Button $size="sm" onClick={addCustomCondition}>Hinzufügen</Button>
            <Button $size="sm" $variant="ghost" onClick={() => { setShowCustomConditionForm(false); setNewCondition(""); }}>Abbrechen</Button>
          </Row>
        )}
        <FieldHint style={{ display: "block", marginTop: 6 }}>
          📋 Standard = bei jedem Standard-Trip dabei. Ohne Bedingung
          (keine Auswahl) = Sonderbedarf, taucht nur auf, wenn manuell
          hinzugefügt.
        </FieldHint>
      </div>
      <Row $gap={8}>
        {onCancel && (
          <Button $variant="ghost" onClick={onCancel} style={{ flex: 1 }}>
            Abbrechen
          </Button>
        )}
        <Button onClick={submit} disabled={!name.trim()} style={{ flex: onCancel ? 2 : 1 }}>
          {submitLabel}
        </Button>
      </Row>
      {!persons.length && (
        <Muted style={{ fontSize: 12 }}>
          Lege in der Familie-Tab Personen an, um Items pro Person zuweisen zu können.
        </Muted>
      )}
    </Stack>
  );
}
