import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Archive, Copy, RefreshCw, Trash2 } from "lucide-react";
import {
  Card,
  Stack,
  Row,
  Muted,
  Badge,
  ProgressTrack,
  ProgressBar,
  Divider,
} from "../components/ui/Layout";
import { Button, IconButton } from "../components/ui/Button";
import { Chip, ChipsScrollable } from "../components/ui/Chip";
import { useDataProvider, useProviderRevision } from "../data/DataProviderContext";
import { useTrip } from "../hooks/useTrips";
import { useTripItems } from "../hooks/useTripItems";
import { useToast } from "../components/ui/Toast";
import { InitialsBadge } from "../components/InitialsBadge";
import { SwipeRow, DesktopOnly } from "../components/SwipeRow";
import { CategoryChip } from "../components/CategoryChip";
import { categoryIcon } from "../labels";
import { useCategories } from "../hooks/useCategories";
import type { TripItem } from "../types";
import { usePersons } from "../hooks/usePersons";
import { useConditions } from "../hooks/useConditions";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { QtyStepper } from "./QtyStepper";
import { QuickAdd } from "./QuickAdd";
import { conditionEmoji, conditionLabel } from "../labels";
import { colors, radii } from "../theme.yak";
import { TripCreateModal } from "./TripCreateModal";

const Page = styled.div`
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  padding-bottom: 80px;
`;

/**
 * Sticky-Block für Personen-Filter + Schnell-Hinzufügen. Bleibt beim
 * Scrollen oben kleben, damit man jederzeit sieht für wen man abhakt
 * und ohne Scroll-zurück Items hinzufügen kann.
 */
const StickyHeader = styled.div`
  position: sticky;
  top: 0;
  z-index: 5;
  background: ${colors.bg};
  padding: 8px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* Subtiler Schatten unten — sichtbar wenn der Block über Items klebt */
  box-shadow: 0 6px 8px -6px rgba(20, 30, 50, 0.18);
  /* In den Page-Inhalt hinein, mit gleicher Hintergrundfarbe wie der Body
     → kein sichtbarer Streifen an den Seitenrändern. */
`;

const ItemRow = styled.div<{ $packed: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: ${radii.sm};
  /* Solider Hintergrund nötig, weil SwipeRow den Delete-Bg darunter
     legt — bei Transparenz würde Rot durchschimmern. */
  background: ${({ $packed }) => ($packed ? colors.surface2 : colors.surface)};
  border: 1px solid ${colors.line};
`;

const ItemName = styled.div<{ $packed: boolean }>`
  font-weight: 500;
  flex: 1;
  min-width: 0;
  text-decoration: ${({ $packed }) => ($packed ? "line-through" : "none")};
  color: ${({ $packed }) => ($packed ? colors.ink3 : colors.ink)};
`;

const CatHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  color: ${colors.ink3};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  padding: 6px 4px;
  position: sticky;
  top: 0;
  background: ${colors.bg};
  z-index: 5;
`;

const PersonDot = styled.span<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  display: inline-block;
`;

function formatDateRange(t: ReturnType<typeof useTrip>) {
  if (!t) return "";
  if (t.startDate && t.endDate) {
    const s = new Date(t.startDate).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
    const e = new Date(t.endDate).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${s} – ${e} · ${t.durationDays} Tage`;
  }
  return `${t.durationDays} Tag${t.durationDays === 1 ? "" : "e"}`;
}

export function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const provider = useDataProvider();
  useProviderRevision();
  const trip = useTrip(id);
  const items = useTripItems(id);
  const persons = usePersons(trip?.familyId);
  const conditions = useConditions(trip?.familyId);
  const familyCategories = useCategories(trip?.familyId);
  const user = useCurrentUser();
  const [filterPerson, setFilterPerson] = useState<string | "all" | "none">("all");
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const toast = useToast();

  // Default filter: link the current user's linked person + unassigned
  const linkedPersonId = useMemo(() => {
    if (!user) return undefined;
    return persons.find((p) => p.linkedUserId === user.id)?.id;
  }, [persons, user]);

  function deleteWithUndo(item: TripItem) {
    // Snapshot tief klonen (für Undo). Direkter Delete — kein Confirm-Dialog.
    const snapshot: TripItem = { ...item };
    provider.deleteTripItem(item.id);
    toast.show({
      message: `„${item.name}" entfernt`,
      action: { label: "Rückgängig", onClick: () => provider.restoreTripItem(snapshot) },
      duration: 6000,
    });
  }

  if (!trip) {
    return (
      <Page>
        <Button $variant="ghost" $size="sm" onClick={() => navigate("/")}>
          <ArrowLeft size={14} /> Zurück
        </Button>
        <Card style={{ marginTop: 16 }}>Trip nicht gefunden.</Card>
      </Page>
    );
  }

  const visibleItems = items.filter((it) => {
    if (filterPerson === "all") return true;
    if (filterPerson === "none") return !it.personId;
    return it.personId === filterPerson;
  });

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const packedQty = items.reduce((s, i) => s + i.packedQty, 0);
  const pct = totalQty === 0 ? 0 : Math.round((packedQty / totalQty) * 100);
  const allDone = totalQty > 0 && pct === 100;

  const byCategory = new Map<string, TripItem[]>();
  for (const it of visibleItems) {
    const cat = it.category || "Sonstiges";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(it);
  }
  const sortedCats = Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b, "de"));


  function memberName(userId?: string): string | undefined {
    if (!userId) return undefined;
    const members = provider.listMembers(trip!.familyId);
    return members.find((m) => m.userId === userId)?.fullName;
  }

  return (
    <Page>
      <Row style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <Button $variant="ghost" $size="sm" onClick={() => navigate("/")}>
          <ArrowLeft size={14} /> Trips
        </Button>
        <Row $gap={4}>
          <IconButton aria-label="Duplizieren" onClick={() => setDuplicateOpen(true)}>
            <Copy size={14} />
          </IconButton>
          <IconButton aria-label="Archivieren" onClick={() => { provider.archiveTrip(trip.id); navigate("/"); }}>
            <Archive size={14} />
          </IconButton>
          <IconButton
            aria-label="Löschen"
            onClick={() => {
              if (confirm(`Trip "${trip.name}" endgültig löschen?`)) {
                provider.deleteTrip(trip.id);
                navigate("/");
              }
            }}
          >
            <Trash2 size={14} />
          </IconButton>
        </Row>
      </Row>

      <Stack $gap={12}>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 2px", letterSpacing: "-0.01em" }}>{trip.name}</h1>
          <Muted>{formatDateRange(trip)}</Muted>
        </div>
        <Row $gap={6} $wrap>
          {trip.conditions.map((c) => (
            <Badge key={c}>{conditionEmoji(c)} {conditionLabel(c, conditions)}</Badge>
          ))}
          {trip.hasWasher && (
            <Badge $tone="success">🧺 Waschmaschine · alle {trip.washIntervalDays} Tage</Badge>
          )}
        </Row>

        <div>
          <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <Muted>{packedQty} / {totalQty} gepackt</Muted>
            <Muted>{pct}%</Muted>
          </Row>
          <ProgressTrack>
            <ProgressBar $pct={pct} $success={allDone} />
          </ProgressTrack>
        </div>

        <StickyHeader>
          {persons.length > 0 && (
            <ChipsScrollable>
              <Chip type="button" $active={filterPerson === "all"} onClick={() => setFilterPerson("all")}>Alle</Chip>
              {persons.map((p) => (
                <Chip key={p.id} type="button" $active={filterPerson === p.id} onClick={() => setFilterPerson(p.id)}>
                  <PersonDot $color={p.color ?? colors.ink3} />
                  {p.name}{linkedPersonId === p.id && " (du)"}
                </Chip>
              ))}
              <Chip type="button" $active={filterPerson === "none"} onClick={() => setFilterPerson("none")}>Gemeinsam</Chip>
            </ChipsScrollable>
          )}

          <QuickAdd
            trip={trip}
            targetPersonId={
              typeof filterPerson === "string" && filterPerson !== "all" && filterPerson !== "none"
                ? filterPerson
                : undefined
            }
          />
        </StickyHeader>

        {items.length === 0 && (
          <Card>
            <Stack $gap={8} $align="center">
              <div style={{ fontSize: 32 }}>📋</div>
              <Muted style={{ textAlign: "center" }}>
                Noch keine Items auf der Liste. Füge oben schnell welche hinzu —
                sie landen automatisch in deiner Vorlage und sind beim nächsten Trip dabei.
              </Muted>
            </Stack>
          </Card>
        )}

        {sortedCats.map(([cat, list]) => {
          const cTotal = list.reduce((s, i) => s + i.quantity, 0);
          const cPacked = list.reduce((s, i) => s + i.packedQty, 0);
          return (
            <div key={cat}>
              <CatHead>
                <span>{cat} · {list.length} {list.length === 1 ? "Item" : "Items"}</span>
                <span>{cPacked}/{cTotal}</span>
              </CatHead>
              <Stack $gap={6}>
                {list.map((it) => {
                  const lastBy = memberName(it.lastPackedBy);
                  const p = persons.find((pp) => pp.id === it.personId);
                  return (
                    <SwipeRow key={it.id} onDelete={() => deleteWithUndo(it)}>
                      <ItemRow $packed={it.isPacked}>
                        <QtyStepper packed={it.packedQty} total={it.quantity} onChange={(n) => provider.setTripItemPacked(it.id, n)} />
                        <Stack $gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Row $gap={6}>
                            <CategoryChip
                              icon={
                                familyCategories.find(
                                  (c) => c.name.toLowerCase() === it.category.toLowerCase(),
                                )?.icon || categoryIcon(it.category)
                              }
                              label={it.category || "Sonstiges"}
                            />
                            <ItemName $packed={it.isPacked}>{it.name}</ItemName>
                          </Row>
                          {lastBy && it.isPacked && (
                            <Muted style={{ fontSize: 11 }}>abgehakt von {lastBy}</Muted>
                          )}
                        </Stack>
                        {p && <InitialsBadge person={p} />}
                        <DesktopOnly>
                          <IconButton
                            aria-label={`"${it.name}" von diesem Trip entfernen`}
                            title="Von diesem Trip entfernen"
                            onClick={() => deleteWithUndo(it)}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </DesktopOnly>
                      </ItemRow>
                    </SwipeRow>
                  );
                })}
              </Stack>
            </div>
          );
        })}

        <Divider />
        <Button $variant="secondary" $block onClick={() => {
          const added = provider.mergeTemplatesIntoTrip(trip.id);
          if (added === 0) alert("Keine neuen Items aus der Vorlage.");
          else alert(`${added} neue Item${added === 1 ? "" : "s"} hinzugefügt.`);
        }}>
          <RefreshCw size={14} /> Fehlende Items aus Vorlage übernehmen
        </Button>
        <details style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: radii.sm, padding: "8px 12px" }}>
          <summary style={{ cursor: "pointer", color: colors.ink2, fontSize: 13 }}>Erweitert</summary>
          <Stack $gap={8} style={{ marginTop: 8 }}>
            <Muted>
              Setzt die Liste komplett neu auf aus der aktuellen Vorlage. Alle Häkchen und manuell hinzugefügte Items gehen verloren.
            </Muted>
            <Button $variant="danger" $size="sm" onClick={() => {
              if (confirm("Komplett aus Vorlage neu aufbauen? Alle Häkchen werden zurückgesetzt.")) {
                provider.rebuildTripItemsFromTemplates(trip.id);
              }
            }}>
              Komplett zurücksetzen
            </Button>
          </Stack>
        </details>
      </Stack>

      {duplicateOpen && (
        <TripCreateModal duplicateSource={trip} onClose={() => setDuplicateOpen(false)} />
      )}
    </Page>
  );
}
