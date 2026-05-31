import { expect, test } from "@playwright/test";
import { freshPage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("AuthGate → CreateFamilyScreen → leerer Trips-Tab + Vorlage + Personen", async ({
  page,
}) => {
  await page.goto("/packliste/");

  // --- AuthGate sichtbar ---
  await expect(page.getByRole("heading", { name: "Packliste" })).toBeVisible();
  await expect(page.getByText("Für deine Familie")).toBeVisible();

  // Toggle "Neu anlegen" ↔ "Mit Code beitreten"
  const newBtn = page.getByRole("button", { name: "Neu anlegen" });
  const codeBtn = page.getByRole("button", { name: "Mit Code beitreten" });
  await expect(newBtn).toBeVisible();
  await expect(codeBtn).toBeVisible();

  // Default ist "Neu anlegen" — wir wechseln zu "Mit Code beitreten" und
  // erwarten, dass der 6-stellige-Code-Input sichtbar ist.
  await codeBtn.click();
  await expect(page.getByLabel("6-stelliger Sync-Code")).toBeVisible();

  // Zurück zu "Neu anlegen" — der Login-Form mit Name + Email muss da sein.
  await newBtn.click();
  await expect(page.getByLabel("Dein Name")).toBeVisible();
  await expect(page.getByLabel("E-Mail")).toBeVisible();

  // --- Login ---
  await page.getByLabel("Dein Name").fill("Sebastian");
  await page.getByLabel("E-Mail").fill("seb@example.com");
  await page.getByRole("button", { name: "Anmelden" }).click();

  // --- CreateFamilyScreen Schritt 1 ---
  await expect(page.getByText("Schritt 1 von 3")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Wie heißt eure Familie?" }),
  ).toBeVisible();
  await page.getByLabel("Familienname").fill("Familie Mustermann");
  await page.getByRole("button", { name: "Weiter" }).click();

  // --- Schritt 2 — Personen ---
  await expect(page.getByText("Schritt 2 von 3")).toBeVisible();
  await page.getByLabel("Personen").fill("Anna\nBob");
  // Personen-Zähler im Hint
  await expect(page.getByText("2 Personen")).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();

  // --- Schritt 3 — Preset "Strand-Wochenende" ---
  await expect(page.getByText("Schritt 3 von 3")).toBeVisible();
  // Preset-Auswahl per Klick auf die Card (Text-Match findet den Button)
  await page.getByText("Strand-Wochenende").click();
  await page.getByRole("button", { name: "Familie anlegen" }).click();

  // --- Erwartung: Trips-Tab, leer ---
  await expect(
    page.getByRole("heading", { name: "Familie Mustermann" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Neuer Trip" }),
  ).toBeVisible();
  await expect(page.getByText("Noch kein Trip angelegt")).toBeVisible();

  // --- Vorlage-Tab: seedete Items aus Strand-Wochenende ---
  // Tab-Bar nutzt Top-Tabs (mobile hat BottomNav). Wir nutzen den Link
  // anhand seiner Text-Content und navigieren über URL als Fallback.
  await page.goto("/packliste/#/vorlage");
  await expect(page.getByText("Sonnencreme")).toBeVisible();
  await expect(page.getByText("Strandtuch")).toBeVisible();
  await expect(page.getByText("Sonnenhut")).toBeVisible();
  await expect(page.getByText("T-Shirt")).toBeVisible();
  // Kategorien sind sortiert — wir prüfen mindestens 3 erwartete:
  await expect(page.getByText(/Hygiene · \d+ Item/)).toBeVisible();
  await expect(page.getByText(/Kleidung · \d+ Item/)).toBeVisible();
  await expect(page.getByText(/Accessoires · \d+ Item/)).toBeVisible();

  // --- Familie-Tab: Anna + Bob mit Avataren ---
  await page.goto("/packliste/#/familie");
  await expect(
    page.getByRole("heading", { name: "Familie Mustermann" }),
  ).toBeVisible();
  // Initialen-Badge ist ein span mit dem Initialen-Buchstaben drin —
  // wir prüfen via Text + dass beide Namen sichtbar sind.
  await expect(page.getByText("Anna", { exact: true })).toBeVisible();
  await expect(page.getByText("Bob", { exact: true })).toBeVisible();
  // Mind. 2 "A" und "B" Initialen-Anzeigen
  await expect(
    page.locator("span", { hasText: /^A$/ }).first(),
  ).toBeVisible();
  await expect(
    page.locator("span", { hasText: /^B$/ }).first(),
  ).toBeVisible();
});
