import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { styled } from "next-yak";
import { Trash2 } from "lucide-react";
import { colors, radii } from "../theme.yak";

/**
 * Touch-Swipe-Wrapper, der bei Wisch nach links einen Delete-Hintergrund
 * enthüllt. Auf Geräten ohne Touch (Desktop-Maus) bleibt das Verhalten
 * neutral — der Consumer rendert üblicherweise einen eigenen sichtbaren
 * Delete-Button für Desktop und versteckt den ggf. via @media-Query.
 *
 * Vertikales Scrollen wird respektiert: erst wenn dX > dY, übernimmt die
 * Komponente das Touch-Event.
 */

const REVEAL_PX = 88;
const TRIGGER_THRESHOLD = 44;

const Outer = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: ${radii.sm};
`;

const DeleteBg = styled.button`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 18px;
  background: ${colors.danger};
  color: white;
  font-weight: 700;
  font-size: 13px;
  border: none;
  gap: 6px;
  cursor: pointer;
`;

const Inner = styled.div<{ $offset: number; $animate: boolean }>`
  position: relative;
  transform: ${({ $offset }) => `translateX(${$offset}px)`};
  transition: ${({ $animate }) => ($animate ? "transform 180ms ease-out" : "none")};
  z-index: 1;
  touch-action: pan-y;
`;

interface Props {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
}

export function SwipeRow({ children, onDelete, deleteLabel = "Löschen" }: Props) {
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [opened, setOpened] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startOffset = useRef(0);
  const isHorizontal = useRef<null | boolean>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setAnimate(true);
    setOffset(0);
    setOpened(false);
  }, []);

  const open = useCallback(() => {
    setAnimate(true);
    setOffset(-REVEAL_PX);
    setOpened(true);
  }, []);

  // Schließt sich, wenn außerhalb getippt wird
  useEffect(() => {
    if (!opened) return;
    function handler(e: PointerEvent) {
      if (!outerRef.current) return;
      if (outerRef.current.contains(e.target as Node)) return;
      close();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [opened, close]);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    startOffset.current = offset;
    isHorizontal.current = null;
    setAnimate(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null || startY.current == null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (isHorizontal.current == null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      } else {
        return;
      }
    }
    if (!isHorizontal.current) return;
    e.preventDefault();
    const next = Math.max(-REVEAL_PX, Math.min(0, startOffset.current + dx));
    setOffset(next);
  }

  function onTouchEnd() {
    if (isHorizontal.current) {
      if (offset < -TRIGGER_THRESHOLD) open();
      else close();
    }
    startX.current = null;
    startY.current = null;
    isHorizontal.current = null;
  }

  return (
    <Outer ref={outerRef}>
      <DeleteBg
        type="button"
        aria-label={deleteLabel}
        tabIndex={opened ? 0 : -1}
        style={{ display: opened || Math.abs(offset) > 0 ? "flex" : "none" }}
        onClick={(e) => {
          if (!opened) return;
          e.stopPropagation();
          onDelete();
          close();
        }}
      >
        <Trash2 size={16} /> {deleteLabel}
      </DeleteBg>
      <Inner
        $offset={offset}
        $animate={animate}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={() => {
          if (opened) close();
        }}
      >
        {children}
      </Inner>
    </Outer>
  );
}

/**
 * Helper: Nur auf Desktop sichtbar (Pointer fine, Hover möglich).
 * Wird auf Touch versteckt — dort übernimmt der Swipe.
 */
export const DesktopOnly = styled.span`
  display: inline-flex;
  gap: 4px;
  @media (hover: none) and (pointer: coarse) {
    display: none;
  }
`;
