import { useEffect, useMemo, useRef, useState } from "react";
import { styled } from "next-yak";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Archive, Copy, RefreshCw, Trash2, Pencil, Printer, Search, X, Plus } from "lucide-react";
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
import { ChipsScrollable } from "../components/ui/Chip";
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
import { useTripWeather } from "../weather/useTripWeather";
import { WeatherHint } from "../weather/WeatherHint";
import { conditionEmoji, conditionLabel } from "../labels";
import { colors, radii } from "../theme.yak";
import { TripCreateModal } from "./TripCreateModal";
import { EditTripItemModal } from "./EditTripItemModal";
import { TripBoard } from "./TripBoard";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { usePackingItems } from "../hooks/usePackingItems";
import { calculateQuantity, fuzzyIncludes } from "../data/derive";
import { parseOmni, type OmniParsed } from "./parseOmni";

const Page = styled.div`
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  padding-bottom: 80px;
  /* Auf großen Screens: volle Breite fürs Personen-Board (Kanban-Ansicht). */
  @media (min-width: 1024px) {
    max-width: min(1680px, 100%);
    padding: 20px 24px 40px;
  }
`;

const SearchBar = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 36px;
  border: 1px solid ${colors.line2};
  border-radius: ${radii.sm};
  background: ${colors.surface};
  font-size: 14px;
  color: ${colors.ink};
  &:focus {
    outline: 2px solid ${colors.primary};
    outline-offset: 0;
    border-color: ${colors.primary};
  }
  &::placeholder {
    color: ${colors.ink3};
  }
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 11px;
  display: inline-flex;
  color: ${colors.ink3};
  pointer-events: none;
`;

const SearchClear = styled.button`
  position: absolute;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${colors.ink3};
  &:hover {
    background: ${colors.surface2};
    color: ${colors.ink2};
  }
`;

/** „Hinzufügen"-Zeile, die erscheint, wenn die Suche keinen Treffer hat. */
const AddOption = styled.button`
  margin-top: 6px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid ${colors.primary};
  background: ${colors.primarySoft};
  color: ${colors.primaryInk};
  border-radius: ${radii.sm};
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  & > span {
    flex: 1;
    min-width: 0;
  }
  & strong {
    font-weight: 700;
  }
  &:hover {
    filter: brightness(0.98);
  }
`;

const AddHint = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${colors.primary};
  border: 1px solid ${colors.primary};
  border-radius: 6px;
  padding: 1px 6px;
  flex-shrink: 0;
`;

/** Hinweis-Banner, wenn doppelte Trip-Items erkannt wurden. */
const DupBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: ${radii.sm};
  background: ${colors.accentSoft};
  border: 1px solid ${colors.accent};
  font-size: 13px;
  color: ${colors.ink};
  & > span {
    flex: 1;
    min-width: 0;
  }
`;

/** Vorschau + Bestätigung für den mehrzeiligen Listen-Import. */
const ImportPanel = styled.div`
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid ${colors.line2};
  border-radius: ${radii.sm};
  background: ${colors.surface};
`;

const ImportList = styled.ul`
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: ${colors.ink2};
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
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
  padding: 8px 4px 4px;
  background: transparent;
`;

const PersonDot = styled.span<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  display: inline-block;
`;

/**
 * Filter-Chip mit eingebauter Progress-Bar als Hintergrund. Zeigt den
 * Pack-Fortschritt der gefilterten Items (Anteil packed_qty / quantity)
 * als Linear-Fill von links. Person-Farbe wird als Fill-Farbe verwendet,
 * leicht transparent damit der Text drüber lesbar bleibt.
 */
const FilterChip = styled.button<{
  $active: boolean;
  $progress: number;
  $color?: string;
  $done?: boolean;
}>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid
    ${({ $active }) => ($active ? colors.primary : colors.line2)};
  background-color: ${({ $active }) =>
    $active ? colors.primarySoft : colors.surface};
  background-image: ${({ $progress, $color, $done }) => {
    const pct = Math.min(100, Math.max(0, $progress * 100));
    const fill = $done
      ? `${colors.success}55`
      : `${$color ?? colors.primary}44`;
    return `linear-gradient(to right, ${fill} ${pct}%, transparent ${pct}%)`;
  }};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  color: ${colors.ink};
  white-space: nowrap;
  scroll-snap-align: start;
  cursor: pointer;
  overflow: hidden;
  transition: background-color 100ms, border-color 100ms;
  & > * {
    position: relative;
    z-index: 1;
  }
  &:hover {
    border-color: ${colors.primary};
  }
`;

const ProgressFrac = styled.span`
  font-size: 11px;
  color: ${colors.ink3};
  font-variant-numeric: tabular-nums;
`;

const SortToggle = styled.div`
  display: inline-flex;
  align-self: flex-start;
  border: 1px solid ${colors.line};
  border-radius: ${radii.sm};
  overflow: hidden;
  background: ${colors.surface};
  margin-bottom: -4px;
`;

const SortBtn = styled.button<{ $active: boolean }>`
  padding: 6px 10px;
  border: none;
  background: ${({ $active }) => ($active ? colors.primarySoft : "transparent")};
  color: ${({ $active }) => ($active ? colors.primaryInk : colors.ink2)};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ $active }) => ($active ? colors.primarySoft : colors.surface2)}; }
  & + & { border-left: 1px solid ${colors.line}; }
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
  const templates = usePackingItems(trip?.familyId);
  const user = useCurrentUser();
  const [filterPerson, setFilterPerson] = useState<string | "all" | "none">("all");
  const [sortMode, setSortMode] = useState<"default" | "open-first">("open-first");
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [editItem, setEditItem] = useState<TripItem | null>(null);
  const toast = useToast();
  const weather = useTripWeather(trip?.destination, trip?.startDate, trip?.endDate);
  // Ab Tablet-/Desktop-Breite: Personen-Board (Spalten nebeneinander) statt
  // der mobilen Ein-Spalten-Liste mit Personen-Filter.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [search, setSearch] = useState("");
  const [importLines, setImportLines] = useState<string[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Cmd+F (Mac) / Ctrl+F (Win/Linux) fokussiert die App-Suche statt der
  // Browser-Suche — so filtert man direkt die Packliste. Escape leert.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Nur die mitreisenden Personen als Filter anzeigen. Bestands-Trips ohne
  // gespeicherte Auswahl (personIds undefined) zeigen weiterhin alle
  // Familienmitglieder.
  const tripPersons = trip.personIds
    ? persons.filter((p) => trip.personIds!.includes(p.id))
    : persons;

  // Omnibox: dasselbe Feld sucht UND legt an. parseOmni trennt Menge (Zahl),
  // Person (@Initialen) und den Item-Namen. Gesucht wird nach dem Namen.
  const parsed = parseOmni(search, tripPersons, trip.durationDays);
  const query = parsed.name.toLowerCase();
  // @Person schränkt Suche UND Add-Prüfung auf diese Person ein: so wird
  // „@Li Regenjacke" als „hat Lilly das?" gewertet — auch wenn jemand
  // anderes das Item schon hat.
  const personScope = parsed.personId;
  // Tippfehler-tolerant: „Bürohse" findet „Bürohose".
  const matchesSearch = (it: TripItem) =>
    !query ||
    fuzzyIncludes(it.name, parsed.name) ||
    fuzzyIncludes(it.category || "", parsed.name);
  const inScope = (it: TripItem) =>
    matchesSearch(it) && (!personScope || (it.personId ?? undefined) === personScope);
  // Board (Desktop) bekommt die gefilterten Items (Name + ggf. @Person);
  // Zähler/Spalten spiegeln dann die Treffer.
  const searchedItems = query || personScope ? items.filter(inScope) : items;
  const matchCount = query ? searchedItems.length : 0;
  // „Hinzufügen" bieten wir nur an, wenn ein Name getippt wurde und es für
  // das Ziel (die @Person, falls angegeben — sonst trip-weit) KEINEN Treffer
  // gibt — sonst ist es ein Suchvorgang.
  const canAdd = query.length > 0 && searchedItems.length === 0;

  /**
   * Legt ein Item aus einem geparsten Omnibox-Ausdruck an. Nutzt ein
   * bestehendes Template (kein Duplikat) oder legt Sonderbedarf an.
   * `skipIfExists` überspringt Zeilen, deren Item es (für dieselbe Person)
   * schon gibt — für den Listen-Import. Liefert true, wenn etwas angelegt
   * wurde.
   */
  function buildAndAdd(p: OmniParsed, skipIfExists = false): boolean {
    if (!trip) return false;
    const name = p.name.trim();
    if (!name) return false;
    if (skipIfExists) {
      const exists = items.some(
        (it) =>
          (it.personId ?? undefined) === p.personId &&
          it.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (exists) return false;
    }
    const tpl = templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (tpl) {
      const userQty = p.qty != null;
      const baseQ = userQty ? p.baseQty : tpl.baseQuantity;
      const unit = userQty ? p.unit : tpl.unit;
      const perDays = userQty ? undefined : tpl.perDays;
      const total = calculateQuantity(
        { baseQuantity: baseQ, unit, washable: tpl.washable, perDays },
        trip,
      );
      provider.addAdhocTripItem({
        tripId: trip.id,
        familyId: trip.familyId,
        personId: p.personId,
        name: tpl.name,
        category: tpl.category,
        baseQuantity: baseQ,
        unit,
        perDays,
        washable: tpl.washable,
        quantity: total,
        sortOrder: 9999,
      });
    } else {
      provider.createPackingItem({
        familyId: trip.familyId,
        personIds: p.personId ? [p.personId] : [],
        name,
        category: "",
        baseQuantity: p.baseQty,
        unit: p.unit,
        washable: false,
        conditions: [],
        sortOrder: templates.length,
      });
      provider.addAdhocTripItem({
        tripId: trip.id,
        familyId: trip.familyId,
        personId: p.personId,
        name,
        category: "",
        baseQuantity: p.baseQty,
        unit: p.unit,
        washable: false,
        quantity: p.totalQty,
        sortOrder: 9999,
      });
    }
    return true;
  }

  function addParsed() {
    if (buildAndAdd(parsed)) {
      toast.show({
        message: `„${parsed.name.trim()}" hinzugefügt${parsed.personLabel ? " · " + parsed.personLabel : ""}`,
      });
      setSearch("");
    }
  }

  // Mehrzeiliges Einfügen → Listen-Import (eine Zeile = ein Item).
  function importList() {
    if (!trip || !importLines) return;
    let n = 0;
    for (const line of importLines) {
      const p = parseOmni(line, tripPersons, trip.durationDays);
      if (buildAndAdd(p, true)) n++;
    }
    toast.show({ message: `${n} Item${n === 1 ? "" : "s"} importiert` });
    setImportLines(null);
    setSearch("");
  }

  // Doppelte Trip-Items: gleicher Name (normalisiert) + gleiche Person.
  const duplicateGroups: TripItem[][] = (() => {
    const map = new Map<string, TripItem[]>();
    for (const it of items) {
      const key = `${it.personId ?? ""}|${it.name.trim().toLowerCase()}`;
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return Array.from(map.values()).filter((g) => g.length > 1);
  })();
  const dupCount = duplicateGroups.reduce((s, g) => s + g.length - 1, 0);

  function mergeDuplicates() {
    for (const group of duplicateGroups) {
      const keeper = group[0];
      // Duplikat = redundant, nicht additiv → höchste Menge/Pack-Stand
      // behalten, nicht summieren. Kategorie: erste nicht-leere gewinnt.
      const quantity = Math.max(...group.map((g) => g.quantity));
      const packed = Math.min(quantity, Math.max(...group.map((g) => g.packedQty)));
      const category = group.find((g) => g.category)?.category ?? keeper.category;
      provider.updateTripItem(keeper.id, { quantity, category });
      provider.setTripItemPacked(keeper.id, packed);
      for (const r of group.slice(1)) provider.deleteTripItem(r.id);
    }
    toast.show({ message: `${dupCount} Duplikat${dupCount === 1 ? "" : "e"} zusammengeführt` });
  }

  const visibleItems = items.filter((it) => {
    if (!inScope(it)) return false;
    if (filterPerson === "all") return true;
    if (filterPerson === "none") return !it.personId;
    return it.personId === filterPerson;
  });

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const packedQty = items.reduce((s, i) => s + i.packedQty, 0);
  const pct = totalQty === 0 ? 0 : Math.round((packedQty / totalQty) * 100);
  const allDone = totalQty > 0 && pct === 100;

  /** Berechnet packed/total für einen Filter-Schlüssel ("all" / "none" / personId). */
  function progressForFilter(key: string | "all" | "none"): {
    packed: number;
    total: number;
    ratio: number;
    done: boolean;
  } {
    const set = items.filter((it) => {
      if (key === "all") return true;
      if (key === "none") return !it.personId;
      return it.personId === key;
    });
    const total = set.reduce((s, i) => s + i.quantity, 0);
    const packed = set.reduce((s, i) => s + i.packedQty, 0);
    const ratio = total === 0 ? 0 : packed / total;
    return { packed, total, ratio, done: total > 0 && packed >= total };
  }

  function groupByCategory(list: TripItem[]): [string, TripItem[]][] {
    const m = new Map<string, TripItem[]>();
    for (const it of list) {
      const cat = it.category || "Sonstiges";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(it);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, "de"));
  }

  // Standard-Modus: alle Items zusammen nach Kategorie gruppiert.
  // Open-First-Modus: offene oben (nach Kategorie), abgehakte unten in
  // einer eingeklappten "Erledigt"-Sektion (auch nach Kategorie).
  const openItems = visibleItems.filter((i) => !i.isPacked);
  const doneItems = visibleItems.filter((i) => i.isPacked);
  const sortedCats = groupByCategory(visibleItems);
  const sortedOpenCats = groupByCategory(openItems);
  const sortedDoneCats = groupByCategory(doneItems);


  function memberName(userId?: string): string | undefined {
    if (!userId) return undefined;
    const members = provider.listMembers(trip!.familyId);
    return members.find((m) => m.userId === userId)?.fullName;
  }

  /** Rendert eine Liste von Kategorie-Gruppen mit ihren TripItems. */
  function renderCategorySections(entries: [string, TripItem[]][]) {
    return entries.map(([cat, list]) => {
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
                    <QtyStepper
                      packed={it.packedQty}
                      total={it.quantity}
                      onChange={(n) => provider.setTripItemPacked(it.id, n)}
                    />
                    <Stack
                      $gap={2}
                      style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                      onClick={() => setEditItem(it)}
                      title="Anzahl anpassen"
                    >
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
                        aria-label={`Anzahl von "${it.name}" anpassen`}
                        title="Anzahl anpassen"
                        onClick={() => setEditItem(it)}
                      >
                        <Pencil size={14} />
                      </IconButton>
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
    });
  }

  return (
    <Page>
      <Row style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <Button $variant="ghost" $size="sm" onClick={() => navigate("/")}>
          <ArrowLeft size={14} /> Trips
        </Button>
        <Row $gap={4}>
          <IconButton aria-label="Drucken" title="Packliste drucken" onClick={() => navigate(`/trip/${trip.id}/print`)}>
            <Printer size={14} />
          </IconButton>
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

        <WeatherHint
          weather={weather}
          activeConditions={trip.conditions}
          onApplyCondition={(key) => {
            if (trip.conditions.includes(key)) return;
            provider.updateTrip(trip.id, { conditions: [...trip.conditions, key] });
            const added = provider.mergeTemplatesIntoTrip(trip.id);
            toast.show({
              message:
                `${conditionLabel(key, conditions)} aktiviert` +
                (added > 0 ? ` · ${added} Item${added === 1 ? "" : "s"} hinzugefügt` : ""),
            });
          }}
        />

        <div>
          <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <Muted>{packedQty} / {totalQty} gepackt</Muted>
            <Muted>{pct}%</Muted>
          </Row>
          <ProgressTrack>
            <ProgressBar $pct={pct} $success={allDone} />
          </ProgressTrack>
        </div>

        {items.length > 0 && (
          <div>
            <SearchBar>
              <SearchIcon>
                <Search size={15} />
              </SearchIcon>
              <SearchInput
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    setImportLines(null);
                    e.currentTarget.blur();
                  } else if (e.key === "Enter" && canAdd) {
                    e.preventDefault();
                    addParsed();
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  const lines = text
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  // Mehrzeilig eingefügt → als Liste importieren.
                  if (lines.length > 1) {
                    e.preventDefault();
                    setImportLines(lines);
                  }
                }}
                placeholder="Suchen · hinzufügen · Liste einfügen …  z.B. 3 @Li Regenjacke"
                aria-label="Suchen oder hinzufügen"
              />
              {search && (
                <SearchClear
                  type="button"
                  aria-label="Eingabe leeren"
                  onClick={() => {
                    setSearch("");
                    searchRef.current?.focus();
                  }}
                >
                  <X size={14} />
                </SearchClear>
              )}
            </SearchBar>

            {importLines ? (
              <ImportPanel>
                <Row style={{ justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 13 }}>
                    {importLines.length} Zeilen einfügen
                  </strong>
                  <SearchClear
                    type="button"
                    aria-label="Import abbrechen"
                    style={{ position: "static" }}
                    onClick={() => setImportLines(null)}
                  >
                    <X size={14} />
                  </SearchClear>
                </Row>
                <ImportList>
                  {importLines.slice(0, 8).map((line, i) => {
                    const p = parseOmni(line, tripPersons, trip.durationDays);
                    return (
                      <li key={i}>
                        {p.name || <em>(kein Name)</em>}
                        {p.totalQty > 1 && ` · ${p.totalQty}×`}
                        {p.personLabel && ` · ${p.personLabel}`}
                      </li>
                    );
                  })}
                  {importLines.length > 8 && (
                    <li>
                      <Muted>… und {importLines.length - 8} weitere</Muted>
                    </li>
                  )}
                </ImportList>
                <Button $size="sm" onClick={importList}>
                  <Plus size={14} /> {importLines.length} Items importieren
                </Button>
                <Muted style={{ fontSize: 11 }}>
                  Eine Zeile = ein Item. Zahl = Menge, @Initialen = Person.
                  Bereits vorhandene werden übersprungen.
                </Muted>
              </ImportPanel>
            ) : canAdd ? (
              <AddOption type="button" onClick={addParsed}>
                <Plus size={15} />
                <span>
                  <strong>„{parsed.name}"</strong> hinzufügen
                  {parsed.totalQty > 1 && <> · {parsed.totalQty}×</>} ·{" "}
                  {parsed.personLabel ?? "Gemeinsam"}
                  {parsed.unit === "per_day" && (
                    <Muted style={{ marginLeft: 6 }}>
                      ({parsed.baseQty}/Tag)
                    </Muted>
                  )}
                </span>
                <AddHint>Enter ↵</AddHint>
              </AddOption>
            ) : query ? (
              <Muted style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                {matchCount} {matchCount === 1 ? "Treffer" : "Treffer"}
              </Muted>
            ) : (search.trim() && parsed.personLabel) ? (
              <Muted style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                Filter/Ziel: {parsed.personLabel}
                {parsed.totalQty > 1 && ` · ${parsed.totalQty}×`}
                {" "}— tippe einen Item-Namen
              </Muted>
            ) : null}
          </div>
        )}

        {dupCount > 0 && (
          <DupBanner>
            <span>
              ⚠ {dupCount} doppelte{dupCount === 1 ? "s" : ""} Item
              {dupCount === 1 ? "" : "s"} gefunden.
            </span>
            <Button $size="sm" $variant="secondary" onClick={mergeDuplicates}>
              Zusammenführen
            </Button>
          </DupBanner>
        )}

        {!isDesktop && (
        <StickyHeader>
          {tripPersons.length > 0 && (
            <ChipsScrollable>
              {(() => {
                const p = progressForFilter("all");
                return (
                  <FilterChip
                    type="button"
                    $active={filterPerson === "all"}
                    $progress={p.ratio}
                    $done={p.done}
                    onClick={() => setFilterPerson("all")}
                  >
                    <span>Alle</span>
                    {p.total > 0 && <ProgressFrac>{p.packed}/{p.total}</ProgressFrac>}
                  </FilterChip>
                );
              })()}
              {tripPersons.map((p) => {
                const stats = progressForFilter(p.id);
                return (
                  <FilterChip
                    key={p.id}
                    type="button"
                    $active={filterPerson === p.id}
                    $progress={stats.ratio}
                    $color={p.color}
                    $done={stats.done}
                    onClick={() => setFilterPerson(p.id)}
                  >
                    <PersonDot $color={p.color ?? colors.ink3} />
                    <span>{p.name}{linkedPersonId === p.id && " (du)"}</span>
                    {stats.total > 0 && (
                      <ProgressFrac>{stats.packed}/{stats.total}</ProgressFrac>
                    )}
                  </FilterChip>
                );
              })}
              {(() => {
                const stats = progressForFilter("none");
                return (
                  <FilterChip
                    type="button"
                    $active={filterPerson === "none"}
                    $progress={stats.ratio}
                    $done={stats.done}
                    onClick={() => setFilterPerson("none")}
                  >
                    <span>Gemeinsam</span>
                    {stats.total > 0 && (
                      <ProgressFrac>{stats.packed}/{stats.total}</ProgressFrac>
                    )}
                  </FilterChip>
                );
              })()}
            </ChipsScrollable>
          )}
        </StickyHeader>
        )}

        {!isDesktop && items.length === 0 && (
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

        {isDesktop ? (
          <TripBoard
            items={searchedItems}
            persons={tripPersons}
            categories={familyCategories}
            onEdit={setEditItem}
            onDelete={deleteWithUndo}
          />
        ) : (
        <>
        <SortToggle>
          <SortBtn type="button" $active={sortMode === "open-first"} onClick={() => setSortMode("open-first")}>
            Offene zuerst
          </SortBtn>
          <SortBtn type="button" $active={sortMode === "default"} onClick={() => setSortMode("default")}>
            Nach Kategorie
          </SortBtn>
        </SortToggle>

        {sortMode === "default" && renderCategorySections(sortedCats)}

        {sortMode === "open-first" && (
          <>
            {renderCategorySections(sortedOpenCats)}
            {doneItems.length > 0 && (
              <details
                open
                style={{
                  background: colors.surface,
                  border: `1px solid ${colors.line}`,
                  borderRadius: radii.sm,
                  padding: "4px 0",
                }}
              >
                <summary
                  style={{
                    padding: "8px 14px",
                    cursor: "pointer",
                    color: colors.ink2,
                    fontSize: 13,
                    fontWeight: 600,
                    listStyle: "revert",
                  }}
                >
                  ✓ Erledigt · {doneItems.length} {doneItems.length === 1 ? "Item" : "Items"}
                </summary>
                <div style={{ padding: "0 4px 6px" }}>
                  {renderCategorySections(sortedDoneCats)}
                </div>
              </details>
            )}
            {openItems.length === 0 && doneItems.length > 0 && (
              <Card>
                <Stack $gap={6} $align="center">
                  <div style={{ fontSize: 28 }}>🎉</div>
                  <strong>Alles gepackt!</strong>
                  <Muted style={{ textAlign: "center" }}>
                    Bleibt nur noch, die Reise zu genießen.
                  </Muted>
                </Stack>
              </Card>
            )}
          </>
        )}
        </>
        )}

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

      {editItem && (
        <EditTripItemModal item={editItem} trip={trip} onClose={() => setEditItem(null)} />
      )}
    </Page>
  );
}
