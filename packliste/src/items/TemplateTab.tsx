import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { Plus, Trash2, ChevronUp, ChevronDown, X } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted, Badge, SectionLabel } from "../components/ui/Layout";
import { Button, IconButton } from "../components/ui/Button";
import { Input, Select, Field, FieldLabel, FieldHint } from "../components/ui/Input";
import { Chip, Chips } from "../components/ui/Chip";
import { Checkbox } from "../components/ui/Checkbox";
import { useCurrentFamily } from "../hooks/useFamily";
import { usePersons } from "../hooks/usePersons";
import { usePackingItems } from "../hooks/usePackingItems";
import { useConditions } from "../hooks/useConditions";
import { useDataProvider } from "../data/DataProviderContext";
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

export function TemplateTab() {
  const family = useCurrentFamily();
  const provider = useDataProvider();
  const persons = usePersons(family?.id);
  const items = usePackingItems(family?.id);
  const conditions = useConditions(family?.id);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [baseQuantity, setBaseQuantity] = useState(1);
  const [unit, setUnit] = useState<QuantityUnit>("per_trip");
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
    // No persons selected → 1 shared item.
    // N persons selected → N items, one per person.
    const targets: (string | undefined)[] =
      selectedPersonIds.length === 0 ? [undefined] : selectedPersonIds;
    targets.forEach((pid, idx) => {
      provider.createPackingItem({
        familyId: family!.id,
        personId: pid,
        name: name.trim(),
        category: category.trim(),
        baseQuantity: Math.max(1, baseQuantity),
        unit,
        washable,
        conditions: [...activeConds],
        sortOrder: items.length + idx,
      });
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

  const previewQty = unit === "per_day" ? `bei 5 Tagen = ${baseQuantity * 5} Stück` : `pro Trip = ${baseQuantity}`;

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
              <Input
                type="number"
                min={1}
                value={baseQuantity}
                onChange={(e) => setBaseQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
            <Field style={{ flex: 1 }}>
              <FieldLabel>Einheit</FieldLabel>
              <Select value={unit} onChange={(e) => setUnit(e.target.value as QuantityUnit)}>
                <option value="per_trip">pro Trip</option>
                <option value="per_day">pro Tag</option>
              </Select>
            </Field>
          </Row>
          <FieldHint>{previewQty}</FieldHint>
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
                const person = persons.find((p) => p.id === it.personId);
                return (
                  <ItemCard key={it.id}>
                    <Badge $tone={it.unit === "per_day" ? "accent" : "primary"}>
                      {it.unit === "per_day" ? "pro Tag" : "pro Trip"}
                    </Badge>
                    <NamePart>
                      <Row $gap={6}>
                        <strong>{it.name}</strong>
                        {it.washable && <span title="Waschbar">🧺</span>}
                        <Muted>×{it.baseQuantity}</Muted>
                      </Row>
                      <ConditionsLine>
                        {person ? <span><PersonDot $color={person.color ?? colors.ink3} /> {person.name}</span> : <span>Gemeinsam</span>}
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
