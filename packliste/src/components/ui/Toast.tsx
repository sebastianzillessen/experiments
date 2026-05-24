import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { styled, keyframes } from "next-yak";
import * as RadixToast from "@radix-ui/react-toast";
import { colors, radii, shadows } from "../../theme.yak";

interface ToastOptions {
  /** Bodytext. */
  message: string;
  /** Optionaler Action-Button (z.B. "Rückgängig"). */
  action?: { label: string; onClick: () => void };
  /** Auto-Dismiss in Millisekunden. Default 5000. */
  duration?: number;
}

interface InternalToast extends ToastOptions {
  id: number;
  open: boolean;
}

interface Ctx {
  show: (opts: ToastOptions) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}

const slideIn = keyframes`
  from { transform: translateY(8px); opacity: 0; }
  to   { transform: translateY(0);   opacity: 1; }
`;

const Viewport = styled(RadixToast.Viewport)`
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 92vw;
  max-width: 420px;
  padding: 0;
  margin: 0;
  list-style: none;
  outline: none;
  pointer-events: none;
  /* Über der mobilen Bottom-Nav schweben */
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  @media (min-width: 601px) {
    bottom: 24px;
  }
  & > * {
    pointer-events: auto;
  }
`;

const Root = styled(RadixToast.Root)`
  background: ${colors.ink};
  color: white;
  padding: 12px 14px;
  border-radius: ${radii.sm};
  box-shadow: ${shadows.md};
  display: flex;
  align-items: center;
  gap: 12px;
  animation: ${slideIn} 180ms ease-out;
  &[data-state="closed"] {
    opacity: 0;
    transition: opacity 120ms;
  }
`;

const Msg = styled(RadixToast.Description)`
  flex: 1;
  min-width: 0;
  font-size: 14px;
`;

const ActionBtn = styled(RadixToast.Action)`
  background: transparent;
  color: ${colors.accent};
  border: none;
  padding: 4px 8px;
  border-radius: 6px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
  font-size: 13px;
  letter-spacing: 0.04em;
  &:hover { background: rgba(255, 255, 255, 0.08); }
`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<InternalToast[]>([]);
  const idRef = useRef(0);

  const show = useCallback((opts: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { ...opts, id, open: true }]);
  }, []);

  const close = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, open: false } : t)));
    // Cleanup after the close animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={value}>
      <RadixToast.Provider swipeDirection="down" duration={5000}>
        {children}
        {toasts.map((t) => (
          <Root
            key={t.id}
            open={t.open}
            duration={t.duration ?? 5000}
            onOpenChange={(open) => {
              if (!open) close(t.id);
            }}
          >
            <Msg>{t.message}</Msg>
            {t.action && (
              <ActionBtn
                altText={t.action.label}
                onClick={() => {
                  t.action!.onClick();
                  close(t.id);
                }}
              >
                {t.action.label}
              </ActionBtn>
            )}
          </Root>
        ))}
        <Viewport />
      </RadixToast.Provider>
    </ToastCtx.Provider>
  );
}
