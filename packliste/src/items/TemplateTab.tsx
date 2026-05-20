import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { Plus, Trash2, ChevronUp, ChevronDown, X, Lightbulb } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted, Badge, SectionLabel } from "../components/ui/Layout";
import { Button, IconButton } from "../components/ui/Button";
import { Input, Field, FieldLabel, FieldHint } from "../components/ui/Input";
import { Chip, Chips } from "../components/ui/Chip";
import { Checkbox } from "../components/ui/Checkbox";
import { NumberStepper } from "../components/ui/NumberStepper";
import { useCurrentFamily } from "../hooks/useFamily";
import { usePersons } from "../hooks/usePersons";
import { usePackingItems } from "../hooks/usePackingItems";
import { useConditions } from "../hooks/useConditions";
import { useDataProvider } from "../data/DataProviderContext";
import { fuzzyMatchCategory } from "../data/derive";
import type { PackingItem, QuantityUnit } from "../types";
import { conditionEmoji, conditionLabel } from "../labels";
import { colors, radii } from "../theme.yak";

const ItemCard = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: ${colors.surface};
  border: 1px solid ${colors.line};
  border-radius: ${radii.sm};
`;

const NamePart = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const PersonDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  display: inline-block;
`;

const ConditionsLine = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  font-size: 11px;
  color: ${colors.ink3};
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

export function TemplateTab() {
  const family = useCurrentFamily();
  const provider = useDataProvider();
  const persons = usePersons(family?.id);
  const items = usePackingItems(family?.id);
  const conditions = useConditions(family?.id);

  type Frequency = "per_trip" | "daily" | "every_n";
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [baseQuantity, setBaseQuantity] = useState(1);
  const [frequency, setFrequency] = useState<Frequency>("per_trip");
  const [perDays, setPerDays] = useState(3);
  const [washable, setWashable] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [activeConds, setActiveConds] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState("");
  const [showCustomConditionForm, setShowCustomConditionForm] = useState(false);

  const categories = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort();
  }, [items]);

  if (!family) return null;

  function toggleCond(key: string) {
    setActiveConds((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  function togglePerson(id: string) {
    setSelectedPersonIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleAllPersons() {
    if (selectedPersonIds.length === persons.length) {
      setSelectedPersonIds([]);
    } else {
      setSelectedPersonIds(persons.map((p) => p.id));
    }
  }

  function addItem() {
    if (!name.trim()) return;
    // Derive unit + perDays from the chosen frequency
    let resolvedUnit: QuantityUnit;
    let resolvedPerDays: number | undefined;
    if (frequency === "per_trip") {
      resolvedUnit = "per_trip";
      resolvedPerDays = undefined;
    } else if (frequency === "daily") {
      resolvedUnit = "per_day";
      resolvedPerDays = 1;
    } else {
      resolvedUnit = "per_day";
      resolvedPerDays = Math.max(1, perDays);
    }
    // Resolve category against existing list (fuzzy auto-correct on submit
    // if the user typed something almost-but-not-quite a known category)
    const trimmedCategory = category.trim();
    const fuzzy = trimmedCategory ? fuzzyMatchCategory(trimmedCategory, categories) : null;
    const finalCategory = fuzzy ?? trimmedCategory;
    // Ein einzelnes Template-Item mit N Personen (1:N). Beim Trip-Anlegen
    // wird daraus pro Person eine TripItem-Row expandiert.
    provider.createPackingItem({
      familyId: family!.id,
      personIds: [...selectedPersonIds],
      name: name.trim(),
      category: finalCategory,
      baseQuantity: Math.max(1, baseQuantity),
      unit: resolvedUnit,
      perDays: resolvedPerDays,
      washable,
      conditions: [...activeConds],
      sortOrder: items.length,
    });
    setName("");
    setBaseQuantity(1);
    setActiveConds([]);
  }

  function addCustomCondition() {
    if (!newCondition.trim()) return;
    provider.createCustomCondition(family!.id, newCondition.trim());
    setNewCondition("");
    setShowCustomConditionForm(false);
  }

  // group items by category
  const byCat = new Map<string, PackingItem[]>();
  for (const it of items) {
    const k = it.category || "Sonstiges";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(it);
  }
  const catEntries = Array.from(byCat.entries()).sort(([a], [b]) => a.localeCompare(b, "de"));

  const categoryFuzzy = useMemo(
    () => fuzzyMatchCategory(category, categories),
    [category, categories],
  );

  const previewQty = (() => {
    const sampleDays = 7;
    if (frequency === "per_trip") return `Pro Trip = ${baseQuantity} Stück`;
    if (frequency === "daily") return `Bei ${sampleDays}-Tage-Trip = ${baseQuantity * sampleDays} Stück (täglich)`;
    const interval = Math.max(1, perDays);
    const cycles = Math.ceil(sampleDays / interval);
    return `Bei ${sampleDays}-Tage-Trip = ${baseQuantity * cycles} Stück (alle ${interval} Tage, aufgerundet)`;
  })();

  return (
    <>
      <Card>
        <CardTitle>Neues Item</CardTitle>
        <Stack $gap={10}>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Unterhose" />
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
                <Chip
                  type="button"
                  $active={selectedPersonIds.length === persons.length && persons.length > 0}
                  onClick={toggleAllPersons}
                >
                  Alle Personen
                </Chip>
                {persons.map((p) => (
                  <Chip
                    key={p.id}
                    type="button"
                    $active={selectedPersonIds.includes(p.id)}
                    onClick={() => togglePerson(p.id)}
                  >
                    <PersonDot $color={p.color ?? colors.ink3} />
                    {p.name}
                  </Chip>
                ))}
              </Chips>
              <FieldHint style={{ display: "block", marginTop: 6 }}>
                {selectedPersonIds.length === 0
                  ? "Niemand ausgewählt → 1 gemeinsames Item für die Familie."
                  : selectedPersonIds.length === 1
                  ? "1 Item für die gewählte Person."
                  : `${selectedPersonIds.length} Items werden angelegt — eines pro Person.`}
              </FieldHint>
            </div>
          )}
          <Row $gap={8}>
            <Field style={{ flex: 1 }}>
              <FieldLabel>Grundmenge</FieldLabel>
              <NumberStepper value={baseQuantity} onChange={setBaseQuantity} min={1} ariaLabel="Grundmenge" />
            </Field>
            {frequency === "every_n" && (
              <Field style={{ flex: 1 }}>
                <FieldLabel>Alle X Tage</FieldLabel>
                <NumberStepper value={perDays} onChange={setPerDays} min={1} max={365} ariaLabel="Wasch-Intervall in Tagen" />
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
            <FieldLabel>Bedingungen (leer = immer)</FieldLabel>
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
                          provider.deleteCustomCondition(family!.id, c.key);
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
          </div>
          <Button $block disabled={!name.trim()} onClick={addItem}>
            <Plus size={16} /> Hinzufügen
          </Button>
        </Stack>
      </Card>

      {items.length === 0 ? (
        <Card>
          <Muted>Noch keine Items in der Vorlage. Lege oben das erste an.</Muted>
        </Card>
      ) : (
        catEntries.map(([cat, list]) => (
          <div key={cat}>
            <SectionLabel>{cat} · {list.length} {list.length === 1 ? "Item" : "Items"}</SectionLabel>
            <Stack $gap={6}>
              {list.map((it, idx) => {
                const assignedPersons = it.personIds
                  .map((pid) => persons.find((p) => p.id === pid))
                  .filter((p): p is NonNullable<typeof p> => Boolean(p));
                const isShared = assignedPersons.length === 0;
                return (
                  <ItemCard key={it.id}>
                    <Badge $tone={it.unit === "per_day" ? "accent" : "primary"}>
                      {it.unit === "per_trip"
                        ? "pro Trip"
                        : (it.perDays ?? 1) === 1
                        ? "pro Tag"
                        : `alle ${it.perDays} Tage`}
                    </Badge>
                    <NamePart>
                      <Row $gap={6}>
                        <strong>{it.name}</strong>
                        {it.washable && <span title="Waschbar">🧺</span>}
                        <Muted>×{it.baseQuantity}</Muted>
                      </Row>
                      <ConditionsLine>
                        {isShared ? (
                          <span>Gemeinsam</span>
                        ) : assignedPersons.length === persons.length ? (
                          <span>Alle Personen</span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                            {assignedPersons.map((p) => (
                              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <PersonDot $color={p.color ?? colors.ink3} />
                                {p.name}
                              </span>
                            ))}
                          </span>
                        )}
                        {it.conditions.length > 0 && (
                          <span>· {it.conditions.map((c) => `${conditionEmoji(c)} ${conditionLabel(c, conditions)}`).join(", ")}</span>
                        )}
                      </ConditionsLine>
                    </NamePart>
                    <Row $gap={2}>
                      <IconButton aria-label="Hoch" onClick={() => provider.movePackingItem(it.id, "up")} disabled={idx === 0}>
                        <ChevronUp size={14} />
                      </IconButton>
                      <IconButton aria-label="Runter" onClick={() => provider.movePackingItem(it.id, "down")} disabled={idx === list.length - 1}>
                        <ChevronDown size={14} />
                      </IconButton>
                      <IconButton aria-label="Löschen" onClick={() => {
                        if (confirm(`"${it.name}" aus der Vorlage löschen?`)) provider.deletePackingItem(it.id);
                      }}>
                        <Trash2 size={14} />
                      </IconButton>
                    </Row>
                  </ItemCard>
                );
              })}
            </Stack>
          </div>
        ))
      )}
    </>
  );
}
