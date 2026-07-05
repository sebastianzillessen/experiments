import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "../components/ui/Button";
import { useTrip } from "../hooks/useTrips";
import { useTripItems } from "../hooks/useTripItems";
import { usePersons } from "../hooks/usePersons";
import { useConditions } from "../hooks/useConditions";
import { useCategories } from "../hooks/useCategories";
import { categoryIcon, conditionEmoji, conditionLabel } from "../labels";
import { personInitials } from "../data/derive";
import type { Person, TripItem } from "../types";

/**
 * Druck-Ansicht einer Packliste. Jedes mitreisende Familienmitglied (plus
 * eine "Gemeinsam"-Karte für nicht zugewiesene Items) wird als eigene Karte
 * gerendert. Die Karten fließen per CSS-Multi-Column in mehrere Spalten und
 * packen sich platzsparend auf eine A4-Hochkant-Seite. Jedes Item bekommt
 * eine leere Checkbox zum Abhaken von Hand.
 *
 * Standard ist der S/W-Modus ($mono): die meisten Drucker sind Schwarz-Weiß,
 * satte Personen-Farben würden dort zu matschigen Graustufen und hohem
 * Toner-Verbrauch führen. Im S/W-Modus tragen kräftige Ränder + fetter
 * schwarzer Text die Struktur; Farbe lässt sich per Toggle zuschalten.
 *
 * Route: /trip/:id/print — erreichbar über den Drucken-Button im TripDetail.
 */

const INK = "#1a1f2c";

const Screen = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
`;

/** Bedien-Leiste — wird beim Drucken komplett ausgeblendet. */
const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  @media print {
    display: none;
  }
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
`;

const ColControl = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4a5366;
  select {
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid #d4d1c4;
    background: #fff;
    font-size: 13px;
  }
`;

/** S/W ↔ Farbig Umschalter (Segmented control). */
const Segmented = styled.div`
  display: inline-flex;
  border: 1px solid #d4d1c4;
  border-radius: 8px;
  overflow: hidden;
`;

const SegBtn = styled.button<{ $active: boolean }>`
  padding: 6px 12px;
  border: none;
  background: ${({ $active }) => ($active ? "#1a1f2c" : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "#4a5366")};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  & + & {
    border-left: 1px solid #d4d1c4;
  }
`;

/**
 * Das eigentliche Druck-Blatt. Auf dem Bildschirm als weiße "Seite" mit
 * Schatten dargestellt, beim Drucken füllt es die A4-Seite ohne Ränder
 * (die kommen über @page).
 */
const Sheet = styled.div`
  background: #fff;
  color: ${INK};
  padding: 14mm;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(20, 30, 50, 0.08), 0 12px 32px rgba(20, 30, 50, 0.06);

  @media print {
    padding: 0;
    border-radius: 0;
    box-shadow: none;
  }
`;

const SheetHeader = styled.div`
  border-bottom: 2px solid ${INK};
  padding-bottom: 8px;
  margin-bottom: 12px;
  break-after: avoid;

  h1 {
    font-size: 20px;
    margin: 0 0 2px;
    letter-spacing: -0.01em;
  }
`;

const Meta = styled.div`
  font-size: 12px;
  color: #4a5366;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid #b7b3a6;
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 11px;
`;

/**
 * Multi-Column-Container: die Personen-Karten fließen in N Spalten. Jede
 * Karte bleibt dank break-inside dabei zusammen und wird nicht über einen
 * Spalten- oder Seitenumbruch zerrissen.
 */
const Columns = styled.div<{ $cols: number }>`
  column-count: ${({ $cols }) => $cols};
  column-gap: 10mm;
  column-fill: balance;
`;

const PersonCard = styled.div<{ $color: string; $mono: boolean }>`
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
  page-break-inside: avoid;
  margin-bottom: 8mm;
  border: 1px solid ${INK};
  border-radius: 6px;
  overflow: hidden;
  /* Im S/W-Modus tragen die Personen ihre Farbe nur als dezenter
     linker Balken — verschwindet auf S/W-Druckern zwar zu Grau, stört
     aber nicht; die Struktur kommt von Rand + fettem Namen. */
  border-left: ${({ $mono, $color }) =>
    $mono ? `5px solid ${INK}` : `1px solid ${$color}`};
`;

const PersonHead = styled.div<{ $color: string; $mono: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: ${({ $mono, $color }) => ($mono ? "#fff" : $color)};
  color: ${({ $mono }) => ($mono ? INK : "#fff")};
  border-bottom: ${({ $mono }) =>
    $mono ? `2px solid ${INK}` : "1px solid rgba(0, 0, 0, 0.12)"};
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;

  strong {
    font-size: 14px;
    flex: 1;
    min-width: 0;
    font-weight: 700;
  }
  span.count {
    font-size: 11px;
    opacity: ${({ $mono }) => ($mono ? 0.75 : 0.9)};
    font-variant-numeric: tabular-nums;
  }
`;

const Initials = styled.span<{ $color: string; $mono: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  background: ${({ $mono }) => ($mono ? "transparent" : "rgba(255, 255, 255, 0.25)")};
  border: ${({ $mono }) => ($mono ? `1.5px solid ${INK}` : "none")};
  color: ${({ $mono }) => ($mono ? INK : "#fff")};
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
`;

const CardBody = styled.div`
  padding: 4px 8px 6px;
`;

const CatLabel = styled.div`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: #4a5366;
  border-bottom: 1px solid #e4e2d9;
  padding-bottom: 1px;
  margin: 7px 0 3px;
  break-after: avoid;

  &:first-child {
    margin-top: 2px;
  }
`;

const ItemLine = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.35;
  break-inside: avoid;
`;

const CheckBox = styled.span`
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 1px;
  border: 1.5px solid ${INK};
  border-radius: 3px;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
`;

const Qty = styled.span`
  flex-shrink: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${INK};
`;

const ItemName = styled.span`
  flex: 1;
  min-width: 0;
`;

const EmptyNote = styled.div`
  font-size: 11px;
  color: #8a92a3;
  font-style: italic;
  padding: 2px 0;
`;

const GhostBoxes = styled.div`
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const GhostLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  span.box {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    border: 1.5px solid #9aa0ac;
    border-radius: 3px;
  }
  span.rule {
    flex: 1;
    border-bottom: 1px dotted #b7bcc6;
    height: 10px;
  }
`;

/** CSS das nur beim Drucken greift: A4 Hochformat + Ränder. */
const PRINT_STYLE = `
  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    html, body { background: #fff !important; }
    /* App-Chrome (BottomNav etc.) verstecken */
    nav { display: none !important; }
  }
`;

function formatDateRange(
  start: string | undefined,
  end: string | undefined,
  durationDays: number,
): string {
  if (start && end) {
    const s = new Date(start).toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
    });
    const e = new Date(end).toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return `${s} – ${e} · ${durationDays} Tage`;
  }
  return `${durationDays} Tag${durationDays === 1 ? "" : "e"}`;
}

function groupByCategory(list: TripItem[]): [string, TripItem[]][] {
  const m = new Map<string, TripItem[]>();
  for (const it of list) {
    const cat = it.category || "Sonstiges";
    if (!m.has(cat)) m.set(cat, []);
    m.get(cat)!.push(it);
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b, "de"))
    .map(
      ([cat, items]) =>
        [
          cat,
          items.slice().sort((a, b) => a.name.localeCompare(b.name, "de")),
        ] as [string, TripItem[]],
    );
}

interface CardData {
  key: string;
  name: string;
  color: string;
  initials: string;
  items: TripItem[];
}

export function TripPrint() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const trip = useTrip(id);
  const items = useTripItems(id);
  const persons = usePersons(trip?.familyId);
  const conditions = useConditions(trip?.familyId);
  const categories = useCategories(trip?.familyId);
  const [cols, setCols] = useState(3);
  // S/W-Modus ist Standard — die meisten Drucker sind Schwarz-Weiß.
  const [mono, setMono] = useState(true);

  const catIconFor = (name: string): string => {
    const hit = categories.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    return hit?.icon || categoryIcon(name);
  };

  // Mitreisende Personen (wie im TripDetail): bei Bestands-Trips ohne
  // gespeicherte Auswahl (personIds undefined) alle Familienmitglieder.
  const tripPersons: Person[] = useMemo(() => {
    if (!trip) return [];
    return trip.personIds
      ? persons.filter((p) => trip.personIds!.includes(p.id))
      : persons;
  }, [trip, persons]);

  const cards: CardData[] = useMemo(() => {
    const out: CardData[] = [];
    // Gemeinsame Items (kein personId) zuerst.
    const shared = items.filter((it) => !it.personId);
    if (shared.length > 0) {
      out.push({
        key: "__shared__",
        name: "Gemeinsam",
        color: "#4a5366",
        initials: "★",
        items: shared,
      });
    }
    for (const p of tripPersons) {
      out.push({
        key: p.id,
        name: p.name,
        color: p.color ?? "#8a92a3",
        initials: personInitials(p),
        items: items.filter((it) => it.personId === p.id),
      });
    }
    return out;
  }, [items, tripPersons]);

  if (!trip) {
    return (
      <Screen>
        <Button $variant="ghost" $size="sm" onClick={() => navigate("/")}>
          <ArrowLeft size={14} /> Zurück
        </Button>
        <p style={{ marginTop: 16 }}>Trip nicht gefunden.</p>
      </Screen>
    );
  }

  const totalItems = items.length;

  return (
    <Screen>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      <Toolbar>
        <Button $variant="ghost" $size="sm" onClick={() => navigate(`/trip/${trip.id}`)}>
          <ArrowLeft size={14} /> Zurück zum Trip
        </Button>
        <Controls>
          <Segmented role="group" aria-label="Druckfarbe">
            <SegBtn type="button" $active={mono} onClick={() => setMono(true)}>
              S/W
            </SegBtn>
            <SegBtn type="button" $active={!mono} onClick={() => setMono(false)}>
              Farbig
            </SegBtn>
          </Segmented>
          <ColControl>
            Spalten
            <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </ColControl>
          <Button $size="sm" onClick={() => window.print()}>
            <Printer size={14} /> Drucken
          </Button>
        </Controls>
      </Toolbar>

      <Sheet>
        <SheetHeader>
          <h1>{trip.name}</h1>
          <Meta>
            <span>{formatDateRange(trip.startDate, trip.endDate, trip.durationDays)}</span>
            <span>·</span>
            <span>{totalItems} Einträge</span>
            {trip.conditions.map((c) => (
              <Tag key={c}>
                {conditionEmoji(c)} {conditionLabel(c, conditions)}
              </Tag>
            ))}
            {trip.hasWasher && <Tag>🧺 alle {trip.washIntervalDays} Tage</Tag>}
          </Meta>
        </SheetHeader>

        <Columns $cols={cols}>
          {cards.map((card) => {
            const grouped = groupByCategory(card.items);
            const cardTotal = card.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <PersonCard key={card.key} $color={card.color} $mono={mono}>
                <PersonHead $color={card.color} $mono={mono}>
                  <Initials $color={card.color} $mono={mono}>
                    {card.initials}
                  </Initials>
                  <strong>{card.name}</strong>
                  {card.items.length > 0 && (
                    <span className="count">
                      {card.items.length} · {cardTotal} St.
                    </span>
                  )}
                </PersonHead>
                <CardBody>
                  {card.items.length === 0 ? (
                    <>
                      <EmptyNote>Keine Einträge — frei zum Ergänzen:</EmptyNote>
                      <GhostBoxes>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <GhostLine key={i}>
                            <span className="box" />
                            <span className="rule" />
                          </GhostLine>
                        ))}
                      </GhostBoxes>
                    </>
                  ) : (
                    grouped.map(([cat, list]) => (
                      <div key={cat}>
                        <CatLabel>
                          {catIconFor(cat)} {cat}
                        </CatLabel>
                        {list.map((it) => (
                          <ItemLine key={it.id}>
                            <CheckBox />
                            {it.quantity > 1 && <Qty>{it.quantity}×</Qty>}
                            <ItemName>{it.name}</ItemName>
                          </ItemLine>
                        ))}
                      </div>
                    ))
                  )}
                </CardBody>
              </PersonCard>
            );
          })}
        </Columns>
      </Sheet>
    </Screen>
  );
}
