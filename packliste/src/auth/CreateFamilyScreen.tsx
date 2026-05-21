import { useState } from "react";
import { styled } from "next-yak";
import { Card, Stack, Row, Muted } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input, Textarea, Field, FieldLabel } from "../components/ui/Input";
import { useDataProvider } from "../data/DataProviderContext";
import { PRESET_LABELS } from "../labels";
import type { PresetKey } from "../types";
import { colors, radii } from "../theme.yak";

const Screen = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 20px;
  max-width: 480px;
  margin: 0 auto;
`;

const StepHint = styled.div`
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${colors.ink3};
  font-weight: 600;
  margin-bottom: 4px;
`;

const StepTitle = styled.h1`
  font-size: 24px;
  margin: 0 0 6px;
  letter-spacing: -0.01em;
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 6px;
`;

const PresetCard = styled.button<{ $selected: boolean }>`
  background: ${({ $selected }) => ($selected ? colors.primarySoft : colors.surface)};
  border: 1px solid ${({ $selected }) => ($selected ? colors.primary : colors.line)};
  border-radius: ${radii.sm};
  padding: 14px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  &:hover { border-color: ${colors.primary}; }
`;

const PresetEmoji = styled.div`
  font-size: 28px;
`;

const PresetName = styled.div`
  font-weight: 600;
  font-size: 14px;
`;

const PresetMeta = styled.div`
  font-size: 12px;
  color: ${colors.ink3};
`;

const PRESET_KEYS: PresetKey[] = ["beach", "ski", "city", "empty"];

export function CreateFamilyScreen() {
  const provider = useDataProvider();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [familyName, setFamilyName] = useState("");
  const [personsRaw, setPersonsRaw] = useState("");
  const [presetKey, setPresetKey] = useState<PresetKey>("empty");

  const personNames = personsRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  function finish() {
    provider.createFamily(familyName, personNames, presetKey);
  }

  return (
    <Screen>
      <Row $align="center" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        {step > 1 ? (
          <Button $variant="ghost" $size="sm" onClick={() => setStep(((step - 1) as 1 | 2 | 3))}>
            ← Zurück
          </Button>
        ) : (
          <span />
        )}
        <Muted>Schritt {step} von 3</Muted>
      </Row>

      {step === 1 && (
        <Stack $gap={14}>
          <div>
            <StepHint>Familie</StepHint>
            <StepTitle>Wie heißt eure Familie?</StepTitle>
            <Muted>Du kannst alles später ändern.</Muted>
          </div>
          <Card>
            <Field>
              <FieldLabel>Familienname</FieldLabel>
              <Input
                autoFocus
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="z.B. Familie Muster"
              />
            </Field>
          </Card>
          <Button $block disabled={familyName.trim().length === 0} onClick={() => setStep(2)}>
            Weiter
          </Button>
        </Stack>
      )}

      {step === 2 && (
        <Stack $gap={14}>
          <div>
            <StepHint>Personen</StepHint>
            <StepTitle>Wer reist mit?</StepTitle>
            <Muted>Eine Person pro Zeile. Kann später ergänzt werden.</Muted>
          </div>
          <Card>
            <Field>
              <FieldLabel>Personen</FieldLabel>
              <Textarea
                autoFocus
                value={personsRaw}
                onChange={(e) => setPersonsRaw(e.target.value)}
                placeholder={"Anna\nBob\nOma"}
                rows={6}
              />
            </Field>
            <Muted style={{ marginTop: 6, display: "block" }}>
              {personNames.length === 0
                ? "Keine Personen — geht auch, kann später ergänzt werden."
                : `${personNames.length} Person${personNames.length === 1 ? "" : "en"}`}
            </Muted>
          </Card>
          <Button $block onClick={() => setStep(3)}>
            Weiter
          </Button>
        </Stack>
      )}

      {step === 3 && (
        <Stack $gap={14}>
          <div>
            <StepHint>Vorlage</StepHint>
            <StepTitle>Soll ich eine Vorlage anlegen?</StepTitle>
            <Muted>Du kannst Items danach beliebig ergänzen oder löschen.</Muted>
          </div>
          <PresetGrid>
            {PRESET_KEYS.map((key) => {
              const meta = PRESET_LABELS[key];
              return (
                <PresetCard
                  key={key}
                  type="button"
                  $selected={presetKey === key}
                  onClick={() => setPresetKey(key)}
                >
                  <PresetEmoji>{meta.emoji}</PresetEmoji>
                  <PresetName>{meta.label}</PresetName>
                  <PresetMeta>{meta.meta}</PresetMeta>
                </PresetCard>
              );
            })}
          </PresetGrid>
          <Button $block onClick={finish}>
            Familie anlegen
          </Button>
        </Stack>
      )}
    </Screen>
  );
}
