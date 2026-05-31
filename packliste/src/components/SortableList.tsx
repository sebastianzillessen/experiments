import { type ReactNode } from "react";
import { styled } from "next-yak";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { colors } from "../theme.yak";

/**
 * Generische sortierbare Liste mit @dnd-kit. Funktioniert auf Touch
 * (Long-Press + Drag) und Desktop (Mouse-Drag) — und unterstützt
 * Keyboard-Navigation (Tab → Enter/Space zum Greifen, Pfeiltasten zum
 * Verschieben, Enter zum Ablegen).
 *
 * Render-Prop bekommt das Item + ein DragHandle-React-Node, das der
 * Consumer an die gewünschte Stelle (üblicherweise Anfang oder Ende
 * der Row) platziert.
 */

interface ItemWithId {
  id: string;
}

interface SortableListProps<T extends ItemWithId> {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
}

export function SortableList<T extends ItemWithId>({
  items,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const sensors = useSensors(
    // Maus: ab 6px Bewegung Drag starten — verhindert versehentliches Drag
    // bei Klicks
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch: 220ms Long-Press, 6px Tolleranz — Scrolling bleibt möglich
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    onReorder(reordered.map((i) => i.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} id={item.id}>
            {(handle) => renderItem(item, handle)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

const RowWrap = styled.div<{ $dragging: boolean }>`
  opacity: ${({ $dragging }) => ($dragging ? 0.65 : 1)};
  box-shadow: ${({ $dragging }) =>
    $dragging ? "0 12px 28px rgba(20, 30, 50, 0.18)" : "none"};
  border-radius: 10px;
  background: ${({ $dragging }) => ($dragging ? colors.surface : "transparent")};
  position: relative;
  z-index: ${({ $dragging }) => ($dragging ? 10 : "auto")};
`;

const HandleBtn = styled.button`
  background: transparent;
  border: none;
  padding: 6px 4px;
  color: ${colors.ink3};
  cursor: grab;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  &:active {
    cursor: grabbing;
    color: ${colors.primary};
  }
  &:focus-visible {
    color: ${colors.primary};
    outline: 2px solid ${colors.primary};
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handle = (
    <HandleBtn type="button" aria-label="Zum Sortieren ziehen" {...attributes} {...listeners}>
      <GripVertical size={16} />
    </HandleBtn>
  );

  return (
    <RowWrap ref={setNodeRef} style={style} $dragging={isDragging}>
      {children(handle)}
    </RowWrap>
  );
}
