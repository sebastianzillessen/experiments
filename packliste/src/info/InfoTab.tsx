import { styled } from "next-yak";
import { Card, CardTitle, Stack } from "../components/ui/Layout";
import { colors } from "../theme.yak";

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

export function InfoTab() {
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
        <CardTitle>v1 — Lokale Daten</CardTitle>
        <Section>
          <p>
            In dieser ersten Version werden alle Daten <strong>nur in diesem Browser</strong> gespeichert. Echte Synchronisation zwischen mehreren Geräten und Einladungen kommen in v2.
          </p>
        </Section>
      </Card>
    </Stack>
  );
}
