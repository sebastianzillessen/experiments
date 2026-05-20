import { useEffect, useState } from "react";
import { styled } from "next-yak";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted, Note } from "../components/ui/Layout";
import { Button, IconButton } from "../components/ui/Button";
import { Input, Select, Field, FieldLabel, FieldHint } from "../components/ui/Input";
import { Checkbox } from "../components/ui/Checkbox";
import { AvatarDot } from "../components/AvatarDot";
import { useCurrentFamily } from "../hooks/useFamily";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { usePersons } from "../hooks/usePersons";
import { useMembers } from "../hooks/useFamily";
import { useDataProvider } from "../data/DataProviderContext";
import { formatInitials } from "../data/derive";
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
  align-items: flex-start;
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

  // Add-form state
  const [name, setName] = useState("");
  const [color, setColor] = useState(PERSON_COLORS[0]);
  const [linkedUserId, setLinkedUserId] = useState<string>("");
  const [isPet, setIsPet] = useState(false);

  // Edit-form state (inline)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editInitials, setEditInitials] = useState("");
  const [editIsPet, setEditIsPet] = useState(false);
  const [editColor, setEditColor] = useState(PERSON_COLORS[0]);

  // Sync color in add-form to next available slot
  useEffect(() => {
    setColor(PERSON_COLORS[persons.length % PERSON_COLORS.length]);
  }, [persons.length]);

  if (!family) return null;

  function add() {
    if (!name.trim()) return;
    provider.createPerson(family!.id, name, color, linkedUserId || undefined, undefined, isPet);
    setName("");
    setLinkedUserId("");
    setIsPet(false);
  }

  function startEdit(p: Person) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditInitials(p.initials ?? "");
    setEditIsPet(p.isPet ?? false);
    setEditColor(p.color ?? PERSON_COLORS[0]);
  }

  function commitEdit() {
    if (!editingId) return;
    provider.updatePerson(editingId, {
      name: editName.trim(),
      initials: editInitials.trim(), // empty → provider recomputes from name
      isPet: editIsPet,
      color: editColor,
    });
    setEditingId(null);
  }

  // Preview-Initialen während des Tippens (wenn das Feld leer ist)
  const initialsPreview = editInitials.trim() || formatInitials(editName || "?");

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
              if (isEditing) {
                return (
                  <PersonRow key={p.id} style={{ flexDirection: "column", gap: 8 }}>
                    <Row style={{ width: "100%" }}>
                      <AvatarDot
                        name={editName || "?"}
                        color={editColor}
                        size={28}
                        initials={initialsPreview}
                      />
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                        autoFocus
                        style={{ flex: 1 }}
                        placeholder="Name"
                      />
                    </Row>
                    <Row style={{ width: "100%", gap: 8 }}>
                      <Field style={{ flex: 1 }}>
                        <FieldLabel>Initialen</FieldLabel>
                        <Input
                          value={editInitials}
                          onChange={(e) => setEditInitials(e.target.value.toUpperCase().slice(0, 3))}
                          placeholder={formatInitials(editName || "?")}
                          maxLength={3}
                        />
                      </Field>
                      <Field style={{ flex: 1 }}>
                        <FieldLabel>Farbe</FieldLabel>
                        <Row $gap={4} $wrap>
                          {PERSON_COLORS.map((c) => (
                            <Pill
                              key={c}
                              type="button"
                              $color={c}
                              $selected={editColor === c}
                              onClick={() => setEditColor(c)}
                              style={{ width: 22, height: 22 }}
                            />
                          ))}
                        </Row>
                      </Field>
                    </Row>
                    <div style={{ width: "100%" }}>
                      <Checkbox
                        checked={editIsPet}
                        onChange={setEditIsPet}
                        label="🐾 Haustier"
                        hint='Wird bei "Alle Personen" nicht automatisch mit-selektiert'
                      />
                    </div>
                    <Row style={{ width: "100%", justifyContent: "flex-end", gap: 6 }}>
                      <Button $size="sm" $variant="ghost" onClick={() => setEditingId(null)}>
                        <X size={14} /> Abbrechen
                      </Button>
                      <Button $size="sm" onClick={commitEdit} disabled={!editName.trim()}>
                        <Check size={14} /> Speichern
                      </Button>
                    </Row>
                  </PersonRow>
                );
              }
              return (
                <PersonRow key={p.id} style={{ alignItems: "center" }}>
                  <AvatarDot name={p.name} color={p.color} size={28} initials={p.initials} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Row $gap={6}>
                      <strong>{p.name}</strong>
                      {p.isPet && <span title="Haustier">🐾</span>}
                    </Row>
                    {(p.linkedUserId || p.initials) && (
                      <Muted style={{ fontSize: 11 }}>
                        {p.linkedUserId && "verknüpft"}
                        {p.linkedUserId && p.initials && " · "}
                        {p.initials && `Initialen: ${p.initials}`}
                      </Muted>
                    )}
                  </div>
                  <Row $gap={2}>
                    <IconButton aria-label="Bearbeiten" onClick={() => startEdit(p)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      aria-label="Löschen"
                      onClick={() => {
                        if (confirm(`Person "${p.name}" löschen? Items dieser Person werden zu "Gemeinsam".`)) {
                          provider.deletePerson(p.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </Row>
                </PersonRow>
              );
            })
          )}
          <Stack $gap={8}>
            <Field>
              <FieldLabel>Neue Person</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Anna" />
              {name.trim() && (
                <FieldHint style={{ display: "block", marginTop: 4 }}>
                  Initialen: <strong>{formatInitials(name)}</strong> (kannst du später bearbeiten)
                </FieldHint>
              )}
            </Field>
            <Field>
              <FieldLabel>Farbe</FieldLabel>
              <Row $gap={6} $wrap>
                {PERSON_COLORS.map((c) => (
                  <Pill key={c} type="button" $color={c} $selected={color === c} onClick={() => setColor(c)} />
                ))}
              </Row>
            </Field>
            <Checkbox
              checked={isPet}
              onChange={setIsPet}
              label="🐾 Haustier"
              hint='Wird bei "Alle Personen" nicht automatisch mit-selektiert'
            />
            {user && !isPet && (
              <Field>
                <FieldLabel>Mit App-Nutzer verknüpfen (optional)</FieldLabel>
                <Select value={linkedUserId} onChange={(e) => setLinkedUserId(e.target.value)}>
                  <option value="">— Nicht verknüpft —</option>
                  <option value={user.id}>{user.name} (du)</option>
                </Select>
              </Field>
            )}
            <Button $block onClick={add} disabled={!name.trim()}>
              <Plus size={16} /> {isPet ? "Haustier" : "Person"} hinzufügen
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card>
        <CardTitle>Wer benutzt die App?</CardTitle>
        <Stack $gap={8}>
          {members.map((m) => (
            <PersonRow key={m.userId} style={{ alignItems: "center" }}>
              <AvatarDot name={m.fullName} color={colors.primary} size={28} initials={m.initials} />
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
