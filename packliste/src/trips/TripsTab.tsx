import { useState } from "react";
import { styled } from "next-yak";
import { Link } from "react-router-dom";
import { Archive, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, Stack, Row, Muted, Badge, SectionLabel } from "../components/ui/Layout";
import { Button, IconButton } from "../components/ui/Button";
import { useCurrentFamily } from "../hooks/useFamily";
import { useTrips } from "../hooks/useTrips";
import { useDataProvider } from "../data/DataProviderContext";
import type { Trip } from "../types";
import { colors } from "../theme.yak";
import { TripCreateModal } from "./TripCreateModal";
import { conditionEmoji, conditionLabel } from "../labels";
import { useConditions } from "../hooks/useConditions";

const TripRow = styled(Link)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 10px;
  background: ${colors.surface};
  border: 1px solid ${colors.line};
  color: ${colors.ink};
  text-decoration: none;
  gap: 8px;
  &:hover { border-color: ${colors.primary}; text-decoration: none; }
`;

const TripMain = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TripName = styled.div`
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MiniProgress = styled.div`
  width: 72px;
  height: 4px;
  background: ${colors.line};
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
  > div {
    height: 100%;
    background: ${colors.success};
  }
`;

function formatDateRange(t: Trip): string {
  if (t.startDate && t.endDate) {
    const s = new Date(t.startDate).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
    const e = new Date(t.endDate).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${s} – ${e} · ${t.durationDays} Tage`;
  }
  return `${t.durationDays} Tag${t.durationDays === 1 ? "" : "e"}`;
}

function groupByYear(trips: Trip[]): { year: string; trips: Trip[] }[] {
  const map = new Map<string, Trip[]>();
  for (const t of trips) {
    const year = (t.startDate ?? t.createdAt).slice(0, 4);
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, ts]) => ({ year, trips: ts }));
}

export function TripsTab() {
  const family = useCurrentFamily();
  const provider = useDataProvider();
  const allTrips = useTrips(family?.id);
  const conditions = useConditions(family?.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<Trip | null>(null);

  if (!family) return null;

  const active = allTrips.filter((t) => !t.archivedAt);
  const archived = allTrips.filter((t) => t.archivedAt);
  const groups = groupByYear(active);

  const lastTrip = active[0];

  function copyLastTrip() {
    if (!lastTrip) {
      setModalOpen(true);
      return;
    }
    setDuplicateSource(lastTrip);
    setModalOpen(true);
  }

  return (
    <>
      <Row $gap={8} $wrap>
        <Button onClick={() => { setDuplicateSource(null); setModalOpen(true); }}>
          <Plus size={16} /> Neuer Trip
        </Button>
        {lastTrip && (
          <Button $variant="secondary" onClick={copyLastTrip}>
            <RefreshCw size={16} /> Wie letzter Trip
          </Button>
        )}
      </Row>

      {active.length === 0 && (
        <Card>
          <Stack $gap={8} $align="center">
            <div style={{ fontSize: 36 }}>🧳</div>
            <strong>Noch kein Trip angelegt</strong>
            <Muted>Lege deinen ersten Trip an — die Packliste wird automatisch generiert.</Muted>
          </Stack>
        </Card>
      )}

      {groups.map(({ year, trips }) => (
        <div key={year}>
          <SectionLabel>{year}</SectionLabel>
          <Stack $gap={8}>
            {trips.map((t) => {
              const items = provider.listTripItems(t.id);
              const total = items.reduce((s, i) => s + i.quantity, 0);
              const packed = items.reduce((s, i) => s + i.packedQty, 0);
              const pct = total === 0 ? 0 : Math.round((packed / total) * 100);
              return (
                <TripRow to={`/trip/${t.id}`} key={t.id}>
                  <TripMain>
                    <TripName>{t.name}</TripName>
                    <Muted>{formatDateRange(t)}</Muted>
                    <Row $gap={4} $wrap>
                      {t.conditions.slice(0, 4).map((c) => (
                        <Badge key={c}>{conditionEmoji(c)} {conditionLabel(c, conditions)}</Badge>
                      ))}
                      {t.hasWasher && <Badge $tone="success">🧺 Wäsche</Badge>}
                    </Row>
                    {total > 0 && <MiniProgress><div style={{ width: `${pct}%` }} /></MiniProgress>}
                  </TripMain>
                  <Row $gap={6}>
                    <IconButton
                      aria-label="Duplizieren"
                      onClick={(e) => { e.preventDefault(); setDuplicateSource(t); setModalOpen(true); }}
                    >
                      <Copy size={14} />
                    </IconButton>
                    <IconButton
                      aria-label="Archivieren"
                      onClick={(e) => { e.preventDefault(); provider.archiveTrip(t.id); }}
                    >
                      <Archive size={14} />
                    </IconButton>
                  </Row>
                </TripRow>
              );
            })}
          </Stack>
        </div>
      ))}

      {archived.length > 0 && (
        <details>
          <summary style={{ padding: "10px 12px", background: colors.surface, borderRadius: 10, border: `1px solid ${colors.line}`, cursor: "pointer", color: colors.ink2 }}>
            Archiviert ({archived.length})
          </summary>
          <Stack $gap={8} style={{ marginTop: 8 }}>
            {archived.map((t) => (
              <TripRow to={`/trip/${t.id}`} key={t.id}>
                <TripMain>
                  <TripName style={{ color: colors.ink3 }}>{t.name}</TripName>
                  <Muted>{formatDateRange(t)}</Muted>
                </TripMain>
                <Row $gap={6}>
                  <IconButton
                    aria-label="Reaktivieren"
                    onClick={(e) => { e.preventDefault(); provider.unarchiveTrip(t.id); }}
                  >
                    <RefreshCw size={14} />
                  </IconButton>
                  <IconButton
                    aria-label="Löschen"
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm(`Trip "${t.name}" endgültig löschen?`)) provider.deleteTrip(t.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Row>
              </TripRow>
            ))}
          </Stack>
        </details>
      )}

      {modalOpen && (
        <TripCreateModal
          duplicateSource={duplicateSource}
          onClose={() => { setModalOpen(false); setDuplicateSource(null); }}
        />
      )}
    </>
  );
}
