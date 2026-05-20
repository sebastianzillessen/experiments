import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { Plus, Lightbulb } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { usePersons } from "../hooks/usePersons";
import { usePackingItems } from "../hooks/usePackingItems";
import { useDataProvider } from "../data/DataProviderContext";
import { calculateQuantity, fuzzyMatchItem } from "../data/derive";
import type { PackingItem, QuantityUnit, Trip } from "../types";
import { colors, radii } from "../theme.yak";

interface Props {
  trip: Trip;
  /**
   * Target person for items added here. If undefined, items are added as
   * "gemeinsam" (shared / family-wide).
   */
  targetPersonId?: string;
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

const MatchHint = styled.button`
  background: ${colors.primarySoft};
  border: 1px solid ${colors.primary};
  border-radius: ${radii.sm};
  padding: 8px 12px;
  font-size: 12px;
  color: ${colors.primaryInk};
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  width: 100%;
  &:hover { filter: brightness(0.97); }
  & strong { font-weight: 700; }
`;

const PersonDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  display: inline-block;
  margin-right: 4px;
  vertical-align: middle;
`;

export function QuickAdd({ trip, targetPersonId }: Props) {
  const { id: tripId, familyId, durationDays } = trip;
  const provider = useDataProvider();
  const persons = usePersons(familyId);
  const templates = usePackingItems(familyId);
  const [text, setText] = useState("");

  const preview = parseLine(text, durationDays);
  const targetPerson = targetPersonId ? persons.find((p) => p.id === targetPersonId) : undefined;
  const targetLabel = targetPerson ? targetPerson.name : "Gemeinsam";

  // Exact-Match (case-insensitive) — wenn der User den Namen genau so
  // tippt wie er in der Vorlage steht, übernehmen wir das Template
  // implizit (kein neues Duplikat anlegen).
  const exactMatch = useMemo(() => {
    if (!preview) return null;
    return (
      templates.find((t) => t.name.toLowerCase() === preview.name.toLowerCase()) ?? null
    );
  }, [preview, templates]);

  // Fuzzy-Match falls kein Exact — zeigen wir als anklickbaren Hint
  const fuzzyMatch = useMemo(() => {
    if (!preview || exactMatch) return null;
    return fuzzyMatchItem(preview.name, templates);
  }, [preview, exactMatch, templates]);

  function addWithTemplate(tpl: PackingItem, parsed: Parsed | null) {
    // Eigene-Mengen-Eingabe (User hat ", N" geschrieben) überschreibt
    // die Template-Einstellungen; sonst übernimmt das Template seine
    // baseQuantity / unit / perDays.
    const userOverrodeQty = parsed?.qty != null;
    const baseQty = userOverrodeQty ? parsed!.baseQty : tpl.baseQuantity;
    const unit = userOverrodeQty ? parsed!.unit : tpl.unit;
    const perDays = userOverrodeQty ? undefined : tpl.perDays;
    const totalQty = calculateQuantity(
      { baseQuantity: baseQty, unit, washable: tpl.washable, perDays },
      trip,
    );
    provider.addAdhocTripItem({
      tripId,
      familyId,
      personId: targetPersonId,
      name: tpl.name,
      category: tpl.category,
      baseQuantity: baseQty,
      unit,
      perDays,
      washable: tpl.washable,
      quantity: totalQty,
      sortOrder: 9999,
    });
    setText("");
  }

  function addNewSonderbedarf(parsed: Parsed) {
    const pid = targetPersonId;
    // Neues Template anlegen: ohne Kategorie, ohne Bedingungen
    // (= Sonderbedarf — nur dieser Trip)
    provider.createPackingItem({
      familyId,
      personIds: pid ? [pid] : [],
      name: parsed.name,
      category: "",
      baseQuantity: parsed.baseQty,
      unit: parsed.unit,
      washable: false,
      conditions: [],
      sortOrder: templates.length,
    });
    // … und für den aktuellen Trip
    provider.addAdhocTripItem({
      tripId,
      familyId,
      personId: pid,
      name: parsed.name,
      category: "",
      baseQuantity: parsed.baseQty,
      unit: parsed.unit,
      washable: false,
      quantity: parsed.totalQty,
      sortOrder: 9999,
    });
    setText("");
  }

  function submit() {
    const parsed = parseLine(text, durationDays);
    if (!parsed) return;
    if (exactMatch) {
      addWithTemplate(exactMatch, parsed);
    } else {
      addNewSonderbedarf(parsed);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <Card>
      <CardTitle>
        Schnell hinzufügen ·{" "}
        <span style={{ color: targetPerson?.color ?? colors.ink3, fontWeight: 600 }}>
          {targetPerson && <PersonDot $color={targetPerson.color ?? colors.ink3} />}
          {targetLabel}
        </span>
      </CardTitle>
      <Stack $gap={8}>
        <Row $gap={8}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="z.B. Sonnenhut · oder · Boxershorts, 5"
            aria-label="Item-Name, optional Komma + Menge"
            style={{ flex: 1 }}
          />
          <Button onClick={submit} disabled={!preview} aria-label="Hinzufügen">
            <Plus size={16} />
          </Button>
        </Row>

        {fuzzyMatch && preview && (
          <MatchHint type="button" onClick={() => addWithTemplate(fuzzyMatch, preview)}>
            <Lightbulb size={14} />
            <span>
              Aus Vorlage übernehmen: <strong>{fuzzyMatch.name}</strong>
              {fuzzyMatch.category && (
                <Muted style={{ marginLeft: 6 }}>· {fuzzyMatch.category}</Muted>
              )}
            </span>
          </MatchHint>
        )}

        {preview ? (
          <HintBox>
            <strong>{preview.name}</strong> ·{" "}
            {preview.unit === "per_day"
              ? `${preview.baseQty} pro Tag = ${preview.totalQty} Stück bei ${durationDays} Tagen`
              : `${preview.totalQty} Stück (pro Trip)`}
            {exactMatch ? (
              <>
                {" · "}
                <em>aus Vorlage</em>
              </>
            ) : !fuzzyMatch ? (
              <>
                {" · "}
                <em>neu — landet als Sonderbedarf in der Vorlage</em>
              </>
            ) : null}
          </HintBox>
        ) : (
          <Muted>
            Enter zum Hinzufügen. Komma + Zahl für die Menge (z.B. "Socken, 7").
            Ähnliche Items aus der Vorlage werden vorgeschlagen.
          </Muted>
        )}
      </Stack>
    </Card>
  );
}
