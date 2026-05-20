import { useState } from "react";
import { styled } from "next-yak";
import { Plus } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";
import { usePersons } from "../hooks/usePersons";
import { usePackingItems } from "../hooks/usePackingItems";
import { useDataProvider } from "../data/DataProviderContext";
import type { QuantityUnit } from "../types";
import { colors } from "../theme.yak";

interface Props {
  tripId: string;
  familyId: string;
  durationDays: number;
  defaultPersonId?: string;
}

interface Parsed {
  name: string;
  qty: number | null;
  baseQty: number;
  unit: QuantityUnit;
  totalQty: number;
}

function parseLine(raw: string, durationDays: number): Parsed | null {
  const parts = raw.split(",").map((s) => s.trim());
  const name = parts[0];
  if (!name) return null;
  const qtyStr = parts[1];
  let qty: number | null = null;
  if (qtyStr !== undefined && qtyStr !== "") {
    const n = Number(qtyStr);
    if (!Number.isFinite(n) || n < 1) return null;
    qty = Math.round(n);
  }

  let baseQty: number;
  let unit: QuantityUnit;
  if (qty == null) {
    baseQty = 1;
    unit = "per_trip";
  } else if (qty > 1 && durationDays > 1 && qty % durationDays === 0) {
    baseQty = qty / durationDays;
    unit = "per_day";
  } else {
    baseQty = qty;
    unit = "per_trip";
  }
  const totalQty = unit === "per_day" ? baseQty * durationDays : baseQty;
  return { name, qty, baseQty, unit, totalQty };
}

const HintBox = styled.div`
  font-size: 12px;
  color: ${colors.ink3};
  background: ${colors.surface2};
  border-radius: 8px;
  padding: 8px 10px;
  & strong {
    color: ${colors.ink2};
  }
`;

export function QuickAdd({ tripId, familyId, durationDays, defaultPersonId }: Props) {
  const provider = useDataProvider();
  const persons = usePersons(familyId);
  const templates = usePackingItems(familyId);
  const [text, setText] = useState("");
  const [personId, setPersonId] = useState<string>(defaultPersonId ?? "");

  const preview = parseLine(text, durationDays);

  function submit() {
    const parsed = parseLine(text, durationDays);
    if (!parsed) return;

    const pid = personId || undefined;
    const matched = templates.find(
      (t) => t.name.toLowerCase() === parsed.name.toLowerCase() && (t.personId ?? "") === (pid ?? ""),
    );

    // Add to template if not present (so future trips benefit)
    if (!matched) {
      provider.createPackingItem({
        familyId,
        personId: pid,
        name: parsed.name,
        category: "",
        baseQuantity: parsed.baseQty,
        unit: parsed.unit,
        washable: false,
        conditions: [],
        sortOrder: templates.length,
      });
    }

    // Add to this trip
    provider.addAdhocTripItem({
      tripId,
      familyId,
      personId: pid,
      name: parsed.name,
      category: matched?.category ?? "",
      baseQuantity: parsed.baseQty,
      unit: parsed.unit,
      washable: matched?.washable ?? false,
      quantity: parsed.totalQty,
      sortOrder: 9999,
    });

    setText("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <Card>
      <CardTitle>Schnell hinzufügen</CardTitle>
      <Stack $gap={8}>
        <Row $gap={8}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="z.B. Sonnenhut · oder · Boxershorts, 5"
            aria-label="Item-Name, optional Komma + Menge"
            style={{ flex: 2 }}
          />
          <Select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            style={{ flex: 1, maxWidth: 140 }}
          >
            <option value="">Gemeinsam</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Button onClick={submit} disabled={!preview} aria-label="Hinzufügen">
            <Plus size={16} />
          </Button>
        </Row>
        {preview ? (
          <HintBox>
            <strong>{preview.name}</strong> ·{" "}
            {preview.unit === "per_day"
              ? `${preview.baseQty} pro Tag = ${preview.totalQty} Stück bei ${durationDays} Tagen`
              : `${preview.totalQty} Stück (pro Trip)`}
            {!templates.some(
              (t) =>
                t.name.toLowerCase() === preview.name.toLowerCase() &&
                (t.personId ?? "") === (personId || ""),
            ) && (
              <>
                {" · "}
                <em>landet auch in der Vorlage</em>
              </>
            )}
          </HintBox>
        ) : (
          <Muted>
            Komma + Zahl = Menge (z.B. "Socken, 7"). Ohne Zahl = 1 pro Trip. Items landen auch in der Vorlage und sind bei zukünftigen Trips verfügbar.
          </Muted>
        )}
      </Stack>
    </Card>
  );
}
