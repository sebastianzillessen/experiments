import { useCallback, useEffect, useState } from "react";
import { styled } from "next-yak";
import { Check, Eye, RefreshCw } from "lucide-react";
import {
  Badge,
  Muted,
  ProgressBar,
  ProgressTrack,
  Row,
  Stack,
} from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { CategoryChip } from "../components/CategoryChip";
import { InitialsBadge } from "../components/InitialsBadge";
import { categoryIcon, conditionEmoji, conditionLabel } from "../labels";
import { colors, radii } from "../theme.yak";
import type { TripItem, TripShareSnapshot } from "../types";

/**
 * Öffentliche Nur-Lese-Ansicht eines geteilten Trips. Wird ohne Login und
 * ohne lokale Daten gerendert (Route: #/share/:code, noch vor dem
 * AuthGate) — alles Nötige steckt im TripShareSnapshot vom Worker.
 *
 * Bewusst keinerlei Mutations-UI: keine Stepper, kein Swipe-Delete, keine
 * Edit-Modals. Der Stand aktualisiert sich beim Fokussieren des Tabs und
 * per Refresh-Button — die teilende Familie pusht Änderungen automatisch
 * (siehe TripShareRunner).
 */

const Page = styled.div`
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  padding-bottom: 40px;
`;

const ReadOnlyBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${colors.primarySoft};
  color: ${colors.primaryInk};
  border-radius: ${radii.sm};
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 14px;
`;

const ItemRow = styled.div<{ $packed: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: ${radii.sm};
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
`;

/** Statische Packed-Anzeige — Ersatz für den interaktiven QtyStepper. */
const PackedState = styled.div<{ $done: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 44px;
  height: 28px;
  padding: 0 8px;
  border-radius: ${radii.pill};
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: ${({ $done }) => ($done ? colors.successSoft : colors.surface2)};
  color: ${({ $done }) => ($done ? colors.success : colors.ink2)};
  border: 1px solid ${({ $done }) => ($done ? colors.success : colors.line2)};
`;

const Centered = styled.div`
  min-height: 60dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 24px;
`;

function formatDateRange(snapshot: TripShareSnapshot): string {
  const { startDate, endDate, durationDays } = snapshot.trip;
  if (startDate && endDate) {
    const s = new Date(startDate).toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
    });
    const e = new Date(endDate).toLocaleDateString("de-CH", {
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
  return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, "de"));
}

interface Props {
  code: string;
}

export function SharedTripView({ code }: Props) {
  const [snapshot, setSnapshot] = useState<TripShareSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/packliste/trip-share/${code}`);
      if (!res.ok) {
        let msg =
          res.status === 404
            ? "Link nicht gefunden oder abgelaufen."
            : `Fehler beim Laden (HTTP ${res.status}).`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // ignore
        }
        setError(msg);
        return;
      }
      const data = (await res.json()) as TripShareSnapshot;
      if (data.schema !== "packliste-trip-v1") {
        setError("Inkompatibles Format des geteilten Trips.");
        return;
      }
      setSnapshot(data);
      setError(null);
    } catch {
      setError("Keine Verbindung — bitte später erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
    // Beim Zurückkehren in den Tab den aktuellen Stand holen — die
    // teilende Familie hakt ja womöglich gerade ab.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  if (error) {
    return (
      <Centered>
        <span style={{ fontSize: 40 }}>🔗</span>
        <h1 style={{ fontSize: 20, margin: 0 }}>Geteilte Packliste</h1>
        <Muted>{error}</Muted>
        <Button $variant="ghost" $size="sm" onClick={() => void load()}>
          <RefreshCw size={14} /> Erneut versuchen
        </Button>
      </Centered>
    );
  }

  if (!snapshot) {
    return (
      <Centered>
        <Muted>Packliste wird geladen …</Muted>
      </Centered>
    );
  }

  const { trip, items, persons, categories, conditions } = snapshot;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const packedQty = items.reduce((s, i) => s + Math.min(i.packedQty, i.quantity), 0);
  const pct = totalQty > 0 ? Math.round((packedQty / totalQty) * 100) : 0;
  const grouped = groupByCategory(items);

  const catIconFor = (name: string): string => {
    const hit = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return hit?.icon || categoryIcon(name);
  };

  const sharedAt = new Date(snapshot.sharedAt).toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Page>
      <ReadOnlyBanner>
        <Eye size={15} />
        <span style={{ flex: 1 }}>
          Nur-Lese-Ansicht{snapshot.familyName ? ` · ${snapshot.familyName}` : ""} · Stand{" "}
          {sharedAt}
        </span>
        <Button
          $variant="ghost"
          $size="sm"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Aktualisieren"
          title="Aktualisieren"
        >
          <RefreshCw size={14} />
        </Button>
      </ReadOnlyBanner>

      <Stack $gap={12}>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 2px", letterSpacing: "-0.01em" }}>
            {trip.name}
          </h1>
          <Muted>{formatDateRange(snapshot)}</Muted>
        </div>

        <Row $gap={6} $wrap>
          {trip.conditions.map((c) => (
            <Badge key={c}>
              {conditionEmoji(c)} {conditionLabel(c, conditions)}
            </Badge>
          ))}
          {trip.hasWasher && (
            <Badge $tone="success">🧺 Waschmaschine · alle {trip.washIntervalDays} Tage</Badge>
          )}
        </Row>

        <div>
          <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <Muted>
              {packedQty} / {totalQty} gepackt
            </Muted>
            <Muted>{pct}%</Muted>
          </Row>
          <ProgressTrack>
            <ProgressBar $pct={pct} $success={pct >= 100} />
          </ProgressTrack>
        </div>

        {items.length === 0 && <Muted>Dieser Trip hat noch keine Einträge.</Muted>}

        {grouped.map(([cat, list]) => {
          const cTotal = list.reduce((s, i) => s + i.quantity, 0);
          const cPacked = list.reduce((s, i) => s + Math.min(i.packedQty, i.quantity), 0);
          return (
            <div key={cat}>
              <CatHead>
                <span>
                  {cat} · {list.length} {list.length === 1 ? "Item" : "Items"}
                </span>
                <span>
                  {cPacked}/{cTotal}
                </span>
              </CatHead>
              <Stack $gap={6}>
                {list.map((it) => {
                  const p = persons.find((pp) => pp.id === it.personId);
                  return (
                    <ItemRow key={it.id} $packed={it.isPacked}>
                      <PackedState $done={it.isPacked} aria-label={it.isPacked ? "gepackt" : "offen"}>
                        {it.isPacked ? <Check size={13} /> : null}
                        {it.packedQty}/{it.quantity}
                      </PackedState>
                      <Row $gap={6} style={{ flex: 1, minWidth: 0 }}>
                        <CategoryChip
                          icon={catIconFor(it.category)}
                          label={it.category || "Sonstiges"}
                        />
                        <ItemName $packed={it.isPacked}>{it.name}</ItemName>
                      </Row>
                      {p && <InitialsBadge person={p} />}
                    </ItemRow>
                  );
                })}
              </Stack>
            </div>
          );
        })}

        <Muted style={{ fontSize: 12, textAlign: "center", marginTop: 12 }}>
          Geteilt mit der Packliste-App · Änderungen sind hier nicht möglich.
        </Muted>
      </Stack>
    </Page>
  );
}
