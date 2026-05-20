import { useRef, useState } from "react";
import { styled } from "next-yak";
import { Download, Upload, Cloud, CloudDownload, Copy, Check } from "lucide-react";
import { Card, CardTitle, Stack, Row, Muted, Note } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input, Field, FieldLabel } from "../components/ui/Input";
import { useDataProvider } from "../data/DataProviderContext";
import { useToast } from "../components/ui/Toast";
import { colors, radii } from "../theme.yak";

const Section = styled.div`
  h4 {
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 700;
  }
  p {
    margin: 0 0 8px;
    color: ${colors.ink2};
    font-size: 14px;
  }
  ul {
    margin: 0;
    padding-left: 20px;
    color: ${colors.ink2};
    font-size: 14px;
  }
  li {
    margin-bottom: 4px;
  }
`;

const CodeDisplay = styled.div`
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.18em;
  background: ${colors.primarySoft};
  color: ${colors.primaryInk};
  border: 2px dashed ${colors.primary};
  border-radius: ${radii.sm};
  padding: 14px 16px;
  text-align: center;
  user-select: all;
`;

export function InfoTab() {
  const provider = useDataProvider();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generateCode() {
    setShareLoading(true);
    setGeneratedCode(null);
    try {
      const code = await provider.shareSnapshotToRemote();
      setGeneratedCode(code);
      setCopied(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.show({ message: `Upload fehlgeschlagen: ${msg}`, duration: 9000 });
    } finally {
      setShareLoading(false);
    }
  }

  async function copyCode() {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.show({ message: "Kopieren fehlgeschlagen — bitte manuell auswählen", duration: 4000 });
    }
  }

  async function importByCode() {
    const code = importCode.trim().toUpperCase().replace(/\s+/g, "");
    if (!code) return;
    if (
      !confirm(
        "Beim Import werden alle aktuellen lokalen Daten überschrieben. Fortfahren?",
      )
    ) {
      return;
    }
    setImportLoading(true);
    try {
      await provider.loadSharedSnapshot(code);
      toast.show({
        message: "Import erfolgreich — Seite wird neu geladen",
        duration: 3000,
      });
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.show({ message: `Import fehlgeschlagen: ${msg}`, duration: 9000 });
    } finally {
      setImportLoading(false);
    }
  }

  function exportData() {
    const json = provider.exportSnapshot();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `packliste-export-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.show({ message: "Export-Datei heruntergeladen", duration: 4000 });
  }

  async function handleFile(file: File) {
    const ok = confirm(
      "Beim Import werden alle aktuellen lokalen Daten überschrieben (Familie, Personen, Vorlage, Trips). Fortfahren?",
    );
    if (!ok) return;
    try {
      const text = await file.text();
      provider.importSnapshot(text);
      toast.show({
        message: "Import erfolgreich — Seite wird neu geladen",
        duration: 3000,
      });
      // Kurze Pause, damit der Toast sichtbar wird
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.show({ message: `Import fehlgeschlagen: ${msg}`, duration: 8000 });
    }
  }

  return (
    <Stack $gap={12}>
      <Card>
        <CardTitle>So funktioniert die Packliste</CardTitle>
        <Section>
          <p>
            Die Idee: einmal eine <strong>Vorlage</strong> für die Familie pflegen, dann pro <strong>Trip</strong> automatisch eine Packliste generieren — basierend auf Reisedauer, Bedingungen und Waschmaschine.
          </p>
        </Section>
      </Card>

      <Card>
        <CardTitle>Personen vs. Mitglieder</CardTitle>
        <Section>
          <ul>
            <li><strong>Personen</strong> sind die Reisenden in der Familie (Anna, Bob, Oma) — Datensätze ohne App-Zugang.</li>
            <li><strong>Mitglieder</strong> sind App-Nutzer (Mama, Papa), die einloggen und abhaken können.</li>
            <li>Eine Person kann optional mit einem Mitglied <strong>verknüpft</strong> werden — dann filtert die App standardmäßig deren Items.</li>
          </ul>
        </Section>
      </Card>

      <Card>
        <CardTitle>"pro Tag" vs. "pro Trip"</CardTitle>
        <Section>
          <ul>
            <li><strong>pro Trip</strong>: 1 Stück egal wie lang die Reise dauert (Zahnbürste, Sonnencreme, Pass).</li>
            <li><strong>pro Tag</strong>: wird mit der Reisedauer multipliziert (Unterhose, T-Shirt).</li>
          </ul>
          <p>Bei einer 5-tägigen Reise wird "Unterhose, 1 pro Tag" = 5 Stück.</p>
        </Section>
      </Card>

      <Card>
        <CardTitle>Bedingungen</CardTitle>
        <Section>
          <p>
            Jedes Item kann Bedingungen haben (Regen, Sonne, Wandern, …). Beim Trip-Anlegen wählst du, welche Bedingungen zutreffen — nur passende Items werden eingepackt.
          </p>
          <p>
            <strong>Ohne Bedingung</strong> = immer mitnehmen (z.B. Reisepass).
          </p>
        </Section>
      </Card>

      <Card>
        <CardTitle>Waschmaschine</CardTitle>
        <Section>
          <p>
            Wenn du beim Trip-Anlegen "Waschmaschine verfügbar" aktivierst und ein <strong>Waschintervall</strong> angibst, werden <strong>waschbare</strong> Items reduziert:
          </p>
          <ul>
            <li>10-Tage-Trip ohne Waschmaschine: 10 Unterhosen</li>
            <li>10-Tage-Trip mit Waschmaschine alle 3 Tage: 4 Unterhosen (3 + 1 Reserve)</li>
          </ul>
        </Section>
      </Card>

      <Card>
        <CardTitle>Trips kopieren & wiederverwenden</CardTitle>
        <Section>
          <p>
            Jeder Trip kann <strong>dupliziert</strong> werden. Per-Tag-Items werden auf die neue Dauer skaliert. Häkchen werden zurückgesetzt.
          </p>
          <p>
            Änderungen an der Vorlage wirken sich <strong>nicht automatisch</strong> auf laufende Trips aus — nutze "Fehlende Items aus Vorlage übernehmen" auf dem Trip.
          </p>
        </Section>
      </Card>

      <Card>
        <CardTitle>Daten sichern / übertragen</CardTitle>
        <Section>
          <p>
            Alle Daten liegen <strong>lokal in diesem Browser</strong>. Mit Export &amp; Import
            kannst du sie als JSON-Datei zwischen Browsern oder Geräten übertragen.
          </p>
        </Section>
        <Stack $gap={8}>
          <Row $gap={8} $wrap>
            <Button onClick={exportData} style={{ flex: "1 1 140px" }}>
              <Download size={16} /> Exportieren
            </Button>
            <Button
              $variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: "1 1 140px" }}
            >
              <Upload size={16} /> Importieren
            </Button>
          </Row>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = ""; // Reset, damit dieselbe Datei nochmal gewählt werden kann
            }}
          />
          <Note>
            Importieren <strong>überschreibt alle aktuellen Daten</strong>. Mach
            vorher einen Export, falls du dir nicht sicher bist.
          </Note>
        </Stack>
      </Card>

      <Card>
        <CardTitle>Per Code teilen</CardTitle>
        <Section>
          <p>
            Schneller als der Datei-Weg: erzeuge auf Browser A einen Code,
            tippe ihn auf Browser B ein. Daten landen verschlüsselt auf
            Cloudflare KV und werden nach <strong>30 Tagen automatisch
            gelöscht</strong>.
          </p>
        </Section>
        <Stack $gap={10}>
          <Stack $gap={8}>
            <Muted style={{ fontSize: 12, fontWeight: 600 }}>
              Daten auf diesem Browser → Code erzeugen
            </Muted>
            <Button onClick={generateCode} disabled={shareLoading}>
              <Cloud size={16} />
              {shareLoading ? "Wird hochgeladen …" : "Code erzeugen"}
            </Button>
            {generatedCode && (
              <Stack $gap={6}>
                <CodeDisplay aria-label="Geteilter Code">{generatedCode}</CodeDisplay>
                <Row $gap={8}>
                  <Button
                    $variant="secondary"
                    $size="sm"
                    onClick={copyCode}
                    style={{ flex: 1 }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Kopiert" : "Kopieren"}
                  </Button>
                </Row>
                <Muted style={{ fontSize: 12 }}>
                  Gültig 30 Tage. Wer den Code kennt, kann deine Daten lesen —
                  also bitte nur an dich selbst oder Familienmitglieder weitergeben.
                </Muted>
              </Stack>
            )}
          </Stack>

          <hr style={{ border: "none", borderTop: `1px solid ${colors.line}`, margin: "4px 0" }} />

          <Stack $gap={8}>
            <Muted style={{ fontSize: 12, fontWeight: 600 }}>
              Code eintippen → Daten holen
            </Muted>
            <Field>
              <FieldLabel>6-stelliger Code</FieldLabel>
              <Input
                value={importCode}
                onChange={(e) =>
                  setImportCode(e.target.value.toUpperCase().slice(0, 6))
                }
                placeholder="ABC234"
                style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.15em" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") importByCode();
                }}
              />
            </Field>
            <Button
              $variant="secondary"
              onClick={importByCode}
              disabled={importLoading || importCode.length !== 6}
            >
              <CloudDownload size={16} />
              {importLoading ? "Wird geladen …" : "Daten holen"}
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card>
        <CardTitle>v1 — Lokale Daten</CardTitle>
        <Section>
          <p>
            In dieser ersten Version werden alle Daten nur in diesem Browser gespeichert.
            Echte Synchronisation zwischen mehreren Geräten und Einladungen kommen in v2.
          </p>
        </Section>
      </Card>
    </Stack>
  );
}
