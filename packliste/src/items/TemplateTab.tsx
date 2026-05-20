import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { Trash2, ChevronUp, ChevronDown, Pencil } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted, Badge, SectionLabel } from "../components/ui/Layout";
import { IconButton } from "../components/ui/Button";
import { useCurrentFamily } from "../hooks/useFamily";
import { usePersons } from "../hooks/usePersons";
import { usePackingItems } from "../hooks/usePackingItems";
import { useConditions } from "../hooks/useConditions";
import { useDataProvider } from "../data/DataProviderContext";
import type { PackingItem } from "../types";
import { conditionEmoji, conditionLabel } from "../labels";
import { colors, radii } from "../theme.yak";
import { ItemForm, type ItemFormValues } from "./ItemForm";
import { EditItemModal } from "./EditItemModal";

const ItemCard = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: ${colors.surface};
  border: 1px solid ${colors.line};
  border-radius: ${radii.sm};
`;

/**
 * Fixe Breite für die Häufigkeits-Badge-Spalte, damit alle Item-Namen
 * in der Liste auf gleicher X-Position starten — egal ob "pro Tag",
 * "pro Trip" oder "alle 10 Tage" davor steht.
 */
const BadgeColumn = styled.div`
  width: 88px;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-start;
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
  const [editingItem, setEditingItem] = useState<PackingItem | null>(null);
  // Force-remount key so the ItemForm clears its internal state after submit
  const [formKey, setFormKey] = useState(0);

  const categories = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort();
  }, [items]);

  if (!family) return null;

  function createItem(values: ItemFormValues) {
    provider.createPackingItem({
      familyId: family!.id,
      personIds: values.personIds,
      name: values.name,
      category: values.category,
      baseQuantity: values.baseQuantity,
      unit: values.unit,
      perDays: values.perDays,
      washable: values.washable,
      conditions: values.conditions,
      sortOrder: items.length,
    });
    setFormKey((k) => k + 1);
  }

  // group items by category
  const byCat = new Map<string, PackingItem[]>();
  for (const it of items) {
    const k = it.category || "Sonstiges";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(it);
  }
  const catEntries = Array.from(byCat.entries()).sort(([a], [b]) => a.localeCompare(b, "de"));

  return (
    <>
      <Card>
        <CardTitle>Neues Item</CardTitle>
        <ItemForm
          key={formKey}
          familyId={family.id}
          persons={persons}
          conditions={conditions}
          categories={categories}
          submitLabel="Hinzufügen"
          onSubmit={createItem}
        />
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
                    <BadgeColumn>
                      <Badge $tone={it.unit === "per_day" ? "accent" : "primary"}>
                        {it.unit === "per_trip"
                          ? "pro Trip"
                          : (it.perDays ?? 1) === 1
                          ? "pro Tag"
                          : `alle ${it.perDays} Tage`}
                      </Badge>
                    </BadgeColumn>
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
                          <span>{it.conditions.map((c) => `${conditionEmoji(c)} ${conditionLabel(c, conditions)}`).join(", ")}</span>
                        )}
                      </ConditionsLine>
                    </NamePart>
                    <Row $gap={2}>
                      <IconButton aria-label="Bearbeiten" onClick={() => setEditingItem(it)}>
                        <Pencil size={14} />
                      </IconButton>
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

      {editingItem && (
        <EditItemModal item={editingItem} onClose={() => setEditingItem(null)} />
      )}
    </>
  );
}
