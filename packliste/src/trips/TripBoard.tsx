import { useMemo, useState } from "react";
import { styled } from "next-yak";
import { GripVertical, Trash2, Pencil } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDataProvider } from "../data/DataProviderContext";
import { InitialsBadge } from "../components/InitialsBadge";
import { QtyStepper } from "./QtyStepper";
import { QuickAdd } from "./QuickAdd";
import { categoryIcon } from "../labels";
import { colors, radii } from "../theme.yak";
import type { Category, Person, Trip, TripItem } from "../types";

/**
 * Desktop-Board für einen Trip: jede Person (plus eine „Gemeinsam"-Spalte)
 * wird als eigene Spalte nebeneinander dargestellt. Die Spalten scrollen
 * horizontal, wenn sie nicht auf den Bildschirm passen; jede Spalte scrollt
 * intern vertikal durch ihre (nach Kategorie gruppierten) Items.
 *
 * Per Drag & Drop lässt sich ein Item in die Kategorie einer beliebigen
 * Person ziehen — die Ablagefläche ist immer eine (Person × Kategorie)-
 * Zelle, sodass ein Drop Person UND Kategorie eindeutig festlegt:
 *   - andere Spalte, gleiche Kategorie → neu zugewiesen
 *   - gleiche Spalte, andere Kategorie → umkategorisiert
 *   - „Gemeinsam"-Spalte → Zuweisung entfernt (personId = undefined)
 */

const SHARED = "__shared__";

function encodeZone(personKey: string, category: string): string {
  return `zone:${personKey}:${encodeURIComponent(category)}`;
}

function decodeZone(id: string): { personKey: string; category: string } | null {
  if (!id.startsWith("zone:")) return null;
  const rest = id.slice(5);
  const sep = rest.indexOf(":");
  if (sep < 0) return null;
  return {
    personKey: rest.slice(0, sep),
    category: decodeURIComponent(rest.slice(sep + 1)),
  };
}

interface Column {
  key: string; // SHARED oder person.id
  personId?: string;
  name: string;
  color: string;
  person?: Person;
}

interface Props {
  trip: Trip;
  items: TripItem[];
  persons: Person[];
  categories: Category[];
  onEdit: (item: TripItem) => void;
  onDelete: (item: TripItem) => void;
}

export function TripBoard({ trip, items, persons, categories, onEdit, onDelete }: Props) {
  const provider = useDataProvider();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns: Column[] = useMemo(() => {
    const cols: Column[] = [
      { key: SHARED, personId: undefined, name: "Gemeinsam", color: colors.ink3 },
    ];
    for (const p of persons) {
      cols.push({ key: p.id, personId: p.id, name: p.name, color: p.color ?? colors.ink3, person: p });
    }
    return cols;
  }, [persons]);

  // Alle im Trip vorkommenden Kategorien (sortiert). Während eines Drags
  // werden in jeder Spalte ALLE diese Kategorien als Ablagezonen gezeigt —
  // auch leere — damit man überall hin umkategorisieren kann. Im Ruhezustand
  // zeigt eine Spalte nur ihre gefüllten Kategorien.
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(it.category || "Sonstiges");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [items]);

  const iconFor = (name: string): string => {
    const hit = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return hit?.icon || categoryIcon(name);
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;
  const dragging = activeId != null;

  /**
   * Kollision: bevorzugt die Zone unter dem Zeiger; fällt auf Rechteck-
   * Überschneidung zurück, falls der Zeiger genau in einer Lücke landet.
   */
  const collision: CollisionDetection = (args) => {
    const p = pointerWithin(args);
    return p.length ? p : rectIntersection(args);
  };

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const target = decodeZone(String(over.id));
    if (!target) return;
    const item = items.find((i) => i.id === active.id);
    if (!item) return;
    const newPersonId = target.personKey === SHARED ? undefined : target.personKey;
    const curCat = item.category || "Sonstiges";
    if ((item.personId ?? undefined) === newPersonId && curCat === target.category) return;
    provider.updateTripItem(item.id, { personId: newPersonId, category: target.category });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <BoardScroll>
        {columns.map((col) => {
          const colItems = items.filter((it) => (it.personId ?? undefined) === col.personId);
          const byCat = new Map<string, TripItem[]>();
          for (const it of colItems) {
            const c = it.category || "Sonstiges";
            if (!byCat.has(c)) byCat.set(c, []);
            byCat.get(c)!.push(it);
          }
          // Sichtbare Kategorien: im Ruhezustand nur gefüllte; beim Drag alle.
          const visibleCats = (dragging ? allCategories : Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, "de")));
          const total = colItems.reduce((s, i) => s + i.quantity, 0);
          const packed = colItems.reduce((s, i) => s + i.packedQty, 0);

          return (
            <ColumnEl key={col.key}>
              <ColHeader $color={col.color}>
                {col.person ? (
                  <InitialsBadge person={col.person} />
                ) : (
                  <SharedDot>★</SharedDot>
                )}
                <ColName>{col.name}</ColName>
                <ColCount>
                  {colItems.length} · {packed}/{total}
                </ColCount>
              </ColHeader>

              <ColBody>
                {visibleCats.length === 0 && !dragging && (
                  <EmptyCol>Noch keine Items.</EmptyCol>
                )}
                {visibleCats.map((cat) => {
                  const list = (byCat.get(cat) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
                  return (
                    <CatSection key={cat}>
                      <CatHead>
                        <span>
                          {iconFor(cat)} {cat}
                        </span>
                        {list.length > 0 && <span>{list.length}</span>}
                      </CatHead>
                      <DropZone
                        id={encodeZone(col.key, cat)}
                        dragging={dragging}
                        empty={list.length === 0}
                      >
                        {list.map((it) => (
                          <BoardItem
                            key={it.id}
                            item={it}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onPack={(n) => provider.setTripItemPacked(it.id, n)}
                          />
                        ))}
                      </DropZone>
                    </CatSection>
                  );
                })}
              </ColBody>

              <ColFooter>
                <QuickAdd trip={trip} targetPersonId={col.personId} />
              </ColFooter>
            </ColumnEl>
          );
        })}
      </BoardScroll>

      <DragOverlay dropAnimation={null}>
        {activeItem ? <ItemCardShell $packed={activeItem.isPacked} $overlay>
          <Grip aria-hidden><GripVertical size={16} /></Grip>
          <ItemMain>
            <ItemName $packed={activeItem.isPacked}>{activeItem.name}</ItemName>
            <ItemMeta>{activeItem.quantity > 1 ? `${activeItem.quantity}×` : ""}</ItemMeta>
          </ItemMain>
        </ItemCardShell> : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ---------------- Drop zone ---------------- */

function DropZone({
  id,
  dragging,
  empty,
  children,
}: {
  id: string;
  dragging: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <Zone ref={setNodeRef} $over={isOver} $dragging={dragging} $empty={empty}>
      {children}
      {empty && dragging && <ZoneHint>hierher ziehen</ZoneHint>}
    </Zone>
  );
}

/* ---------------- Draggable item ---------------- */

function BoardItem({
  item,
  onEdit,
  onDelete,
  onPack,
}: {
  item: TripItem;
  onEdit: (i: TripItem) => void;
  onDelete: (i: TripItem) => void;
  onPack: (n: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 }
    : { opacity: isDragging ? 0.35 : 1 };

  return (
    <ItemCardShell ref={setNodeRef} style={style} $packed={item.isPacked}>
      <Grip {...attributes} {...listeners} aria-label={`„${item.name}" verschieben`}>
        <GripVertical size={16} />
      </Grip>
      <ItemMain onClick={() => onEdit(item)} title="Bearbeiten">
        <ItemName $packed={item.isPacked}>{item.name}</ItemName>
        <ItemMeta>{item.quantity > 1 ? `${item.quantity}×` : ""}</ItemMeta>
      </ItemMain>
      <QtyStepper packed={item.packedQty} total={item.quantity} onChange={onPack} />
      <RowActions>
        <MiniBtn aria-label="Bearbeiten" onClick={() => onEdit(item)}>
          <Pencil size={13} />
        </MiniBtn>
        <MiniBtn aria-label="Entfernen" onClick={() => onDelete(item)}>
          <Trash2 size={13} />
        </MiniBtn>
      </RowActions>
    </ItemCardShell>
  );
}

/* ---------------- styles ---------------- */

const BoardScroll = styled.div`
  display: flex;
  gap: 14px;
  align-items: flex-start;
  overflow-x: auto;
  padding: 4px 2px 12px;
  /* Sanftes Snap beim horizontalen Scrollen zwischen Personen. */
  scroll-snap-type: x proximity;
`;

const ColumnEl = styled.div`
  flex: 0 0 340px;
  width: 340px;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  /* Jede Spalte scrollt intern; Höhe an den Viewport gekoppelt. */
  max-height: calc(100vh - 210px);
  background: ${colors.surface2};
  border: 1px solid ${colors.line};
  border-radius: ${radii.md};
  overflow: hidden;
  scroll-snap-align: start;
`;

const ColHeader = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid ${colors.line};
  background: ${colors.surface};
  border-top: 3px solid ${({ $color }) => $color};
`;

const SharedDot = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: ${colors.ink3};
  color: #fff;
  font-size: 12px;
  font-weight: 700;
`;

const ColName = styled.div`
  font-weight: 700;
  font-size: 15px;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ColCount = styled.div`
  font-size: 11px;
  color: ${colors.ink3};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const ColBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
`;

const ColFooter = styled.div`
  border-top: 1px solid ${colors.line};
  padding: 8px;
  background: ${colors.surface};
`;

const EmptyCol = styled.div`
  color: ${colors.ink3};
  font-size: 13px;
  text-align: center;
  padding: 20px 8px;
`;

const CatSection = styled.div`
  margin-bottom: 6px;
`;

const CatHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  color: ${colors.ink3};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  padding: 8px 4px 3px;
`;

const Zone = styled.div<{ $over: boolean; $dragging: boolean; $empty: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-radius: ${radii.sm};
  min-height: ${({ $empty, $dragging }) => ($empty && $dragging ? "34px" : "2px")};
  padding: ${({ $dragging }) => ($dragging ? "4px" : "0")};
  border: 2px dashed
    ${({ $over, $dragging }) => ($over ? colors.primary : $dragging ? colors.line2 : "transparent")};
  background: ${({ $over }) => ($over ? colors.primarySoft : "transparent")};
  transition: background 90ms, border-color 90ms;
`;

const ZoneHint = styled.div`
  font-size: 11px;
  color: ${colors.ink3};
  text-align: center;
  padding: 4px;
  font-style: italic;
`;

const ItemCardShell = styled.div<{ $packed: boolean; $overlay?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: ${radii.sm};
  background: ${({ $packed }) => ($packed ? colors.surface2 : colors.surface)};
  border: 1px solid ${colors.line};
  box-shadow: ${({ $overlay }) =>
    $overlay ? "0 12px 28px rgba(20, 30, 50, 0.22)" : "none"};
  cursor: default;
`;

const Grip = styled.button`
  background: transparent;
  border: none;
  padding: 2px;
  color: ${colors.ink3};
  cursor: grab;
  display: inline-flex;
  flex-shrink: 0;
  touch-action: none;
  &:active {
    cursor: grabbing;
    color: ${colors.primary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.primary};
    outline-offset: 2px;
    border-radius: 4px;
    color: ${colors.primary};
  }
`;

const ItemMain = styled.div`
  flex: 1;
  min-width: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const ItemName = styled.div<{ $packed: boolean }>`
  font-weight: 500;
  font-size: 13px;
  line-height: 1.25;
  word-break: break-word;
  text-decoration: ${({ $packed }) => ($packed ? "line-through" : "none")};
  color: ${({ $packed }) => ($packed ? colors.ink3 : colors.ink)};
`;

const ItemMeta = styled.div`
  font-size: 11px;
  color: ${colors.primary};
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`;

const RowActions = styled.div`
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
`;

const MiniBtn = styled.button`
  background: transparent;
  border: none;
  padding: 3px;
  color: ${colors.ink3};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  &:hover {
    background: ${colors.surface2};
    color: ${colors.ink2};
  }
`;
