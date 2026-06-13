import { expect, test } from "@playwright/test";
import { freshPage, setupNewFamily, tripItemRow } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

// Open-Meteo wird in Tests gestubbt — keine echten Netzwerkaufrufe.
async function stubWeather(
  page: import("@playwright/test").Page,
  opts: { place: string; country: string; daily: Record<string, number[] | string[]> },
) {
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          { name: opts.place, country: opts.country, latitude: 53.55, longitude: 9.99 },
        ],
      }),
    }),
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ daily: opts.daily }),
    }),
  );
}

test("Wetter-Hinweis: Reiseziel-Erkennung, Vorhersage, Bedingung übernehmen", async ({
  page,
}) => {
  // Regen-Szenario: 80% Regenwahrscheinlichkeit, mild → nur "Regen" empfohlen.
  await stubWeather(page, {
    place: "Hamburg",
    country: "Deutschland",
    daily: {
      time: ["2026-06-20", "2026-06-21", "2026-06-22"],
      temperature_2m_max: [19, 20, 18],
      temperature_2m_min: [12, 13, 11],
      precipitation_probability_max: [80, 70, 60],
      weather_code: [61, 63, 80],
    },
  });

  await setupNewFamily(page, {
    familyName: "Familie Wetter",
    persons: ["Anna"],
    preset: "Städtetrip", // enthält Regenjacke/Regenschirm (Bedingung "rain")
  });

  await page.getByRole("button", { name: "Neuer Trip" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  // Name eingeben → Reiseziel wird automatisch erkannt ("Wochenende" entfällt).
  await modal.getByLabel("Trip-Name").fill("Wochenende Hamburg");
  await expect(modal.getByRole("textbox", { name: "Reiseziel (optional)" })).toHaveValue(
    "Hamburg",
  );

  // Standard-Datum liegt 14 Tage in der Zukunft → Vorhersage verfügbar.
  await expect(modal.getByText(/Wetter in Hamburg/)).toBeVisible();
  await expect(modal.getByText(/Regen wahrscheinlich/)).toBeVisible();

  // Trip OHNE Regen-Bedingung anlegen (Vorschlag im Modal nicht angetippt).
  await modal.getByRole("button", { name: "Trip anlegen" }).click();
  await page.waitForURL(/\/#\/trip\//);

  // Regenjacke ist noch nicht dabei (Bedingung "rain" nicht aktiv).
  await expect(tripItemRow(page, "Regenjacke")).toHaveCount(0);

  // Auf der Detailseite erscheint der Wetter-Hinweis erneut; Regen übernehmen.
  await expect(page.getByText(/Wetter in Hamburg/)).toBeVisible();
  // Nur der Wetter-Vorschlags-Chip endet auf "Regen" (Item-Buttons wie
  // "Regenjacke" tun das nicht).
  await page.getByRole("button", { name: /Regen$/ }).click();

  // Bestätigung + Regen-Items wurden aus der Vorlage ergänzt.
  await expect(page.getByText(/Regen aktiviert/).first()).toBeVisible();
  await expect(tripItemRow(page, "Regenjacke")).toBeVisible();
});

test("Wetter-Hinweis: Zeitraum zu weit entfernt", async ({ page }) => {
  await stubWeather(page, {
    place: "Hamburg",
    country: "Deutschland",
    daily: { time: ["2026-06-20"], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [10], weather_code: [1] },
  });

  await setupNewFamily(page, { familyName: "Familie Fern", persons: ["Anna"], preset: "Leer starten" });

  await page.getByRole("button", { name: "Neuer Trip" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Trip-Name").fill("Sommer Hamburg");

  // Anreise weit in der Zukunft setzen (> 14 Tage) → "zu weit entfernt".
  const far = new Date();
  far.setDate(far.getDate() + 60);
  const iso = far.toISOString().slice(0, 10);
  await modal.locator('input[type="date"]').first().fill(iso);

  await expect(modal.getByText(/erst näher am Termin/)).toBeVisible();
});
