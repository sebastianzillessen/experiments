import { useState } from "react";
import { styled } from "next-yak";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted, Note } from "../components/ui/Layout";
import { Button, IconButton } from "../components/ui/Button";
import { Input, Select, Field, FieldLabel } from "../components/ui/Input";
import { AvatarDot } from "../components/AvatarDot";
import { useCurrentFamily } from "../hooks/useFamily";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { usePersons } from "../hooks/usePersons";
import { useMembers } from "../hooks/useFamily";
import { useDataProvider } from "../data/DataProviderContext";
import type { Person } from "../types";
import { PERSON_COLORS } from "../labels";
import { colors, radii } from "../theme.yak";

const Pill = styled.button<{ $color: string; $selected: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  border: 2px solid ${({ $selected }) => ($selected ? colors.ink : "transparent")};
  cursor: pointer;
`;

const PersonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: ${colors.surface};
  border: 1px solid ${colors.line};
  border-radius: ${radii.sm};
`;

export function FamilyTab() {
  const family = useCurrentFamily();
  const provider = useDataProvider();
  const user = useCurrentUser();
  const persons = usePersons(family?.id);
  const members = useMembers(family?.id);

  const [name, setName] = useState("");
  const [color, setColor] = useState(PERSON_COLORS[0]);
  const [linkedUserId, setLinkedUserId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  if (!family) return null;

  function add() {
    if (!name.trim()) return;
    provider.createPerson(family!.id, name, color, linkedUserId || undefined);
    setName("");
    setLinkedUserId("");
    const nextColor = PERSON_COLORS[(persons.length + 1) % PERSON_COLORS.length];
    setColor(nextColor);
  }

  function startEdit(p: Person) {
    setEditingId(p.id);
    setEditingName(p.name);
  }

  function commitEdit() {
    if (!editingId) return;
    provider.updatePerson(editingId, { name: editingName.trim() });
    setEditingId(null);
  }

  return (
    <>
      <Card>
        <CardTitle>Wer reist mit?</CardTitle>
        <Stack $gap={10}>
          {persons.length === 0 ? (
            <Muted>Noch keine Personen. Lege unten die erste an.</Muted>
          ) : (
            persons.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <PersonRow key={p.id}>
                  <AvatarDot name={p.name} color={p.color} size={28} />
                  {isEditing ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <IconButton aria-label="Speichern" onClick={commitEdit}><Check size={14} /></IconButton>
                      <IconButton aria-label="Abbrechen" onClick={() => setEditingId(null)}><X size={14} /></IconButton>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{p.name}</strong>
                        {p.linkedUserId && (
                          <Muted style={{ marginLeft: 6 }}>· verknüpft</Muted>
                        )}
                      </div>
                      <Row $gap={2}>
                        <IconButton aria-label="Umbenennen" onClick={() => startEdit(p)}>✎</IconButton>
                        <IconButton aria-label="Löschen" onClick={() => {
                          if (confirm(`Person "${p.name}" löschen? Items dieser Person werden zu "Gemeinsam".`)) {
                            provider.deletePerson(p.id);
                          }
                        }}>
                          <Trash2 size={14} />
                        </IconButton>
                      </Row>
                    </>
                  )}
                </PersonRow>
              );
            })
          )}
          <Stack $gap={8}>
            <Field>
              <FieldLabel>Neue Person</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Anna" />
            </Field>
            <Field>
              <FieldLabel>Farbe</FieldLabel>
              <Row $gap={6} $wrap>
                {PERSON_COLORS.map((c) => (
                  <Pill key={c} type="button" $color={c} $selected={color === c} onClick={() => setColor(c)} />
                ))}
              </Row>
            </Field>
            {user && (
              <Field>
                <FieldLabel>Mit App-Nutzer verknüpfen (optional)</FieldLabel>
                <Select value={linkedUserId} onChange={(e) => setLinkedUserId(e.target.value)}>
                  <option value="">— Nicht verknüpft —</option>
                  <option value={user.id}>{user.name} (du)</option>
                </Select>
              </Field>
            )}
            <Button $block onClick={add} disabled={!name.trim()}>
              <Plus size={16} /> Person hinzufügen
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card>
        <CardTitle>Wer benutzt die App?</CardTitle>
        <Stack $gap={8}>
          {members.map((m) => (
            <PersonRow key={m.userId}>
              <AvatarDot name={m.fullName} color={colors.primary} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{m.fullName}</strong>
                <Muted style={{ marginLeft: 6 }}>· {m.role === "owner" ? "Owner" : "Mitglied"} · du</Muted>
              </div>
            </PersonRow>
          ))}
          <Note>
            Weitere Mitglieder einladen ist in einer späteren Version möglich.
            Daten werden derzeit nur lokal in diesem Browser gespeichert.
          </Note>
        </Stack>
      </Card>
    </>
  );
}
