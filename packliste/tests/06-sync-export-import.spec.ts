import { expect, test } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Info-Tab: Exportieren lädt JSON-Datei herunter; Roundtrip via Blob", async ({
  page,
}) => {
  await setupNewFamily(page, {
    familyName: "Familie Export",
    persons: ["Anna"],
    preset: "Strand-Wochenende",
  });
  await createTrip(page, {
    name: "Export-Trip",
    days: 3,
    conditions: ["Sonne"],
  });

  // Info-Tab
  await page.goto("/packliste/#/info");
  await expect(page.getByRole("heading", { name: "Familie Export" })).toBeVisible();

  // --- Export: Download abfangen ---
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportieren" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^packliste-export-\d{4}-\d{2}-\d{2}\.json$/,
  );

  // Inhalt prüfen — der Snapshot enthält schema "packliste-v1".
  const path = await download.path();
  expect(path).toBeTruthy();
  // Wir lesen die Datei via Page-Evaluate (Node fs nicht in browser-Tests)
  // → stattdessen: download.createReadStream() ist ok, aber einfacher:
  // path lesen über Node fs.
  const fs = await import("node:fs/promises");
  const content = await fs.readFile(path!, "utf-8");
  const parsed = JSON.parse(content);
  expect(parsed.schema).toBe("packliste-v1");
  expect(parsed.data).toBeTruthy();
  // Family-Name muss im Snapshot stehen
  const flatten = JSON.stringify(parsed.data);
  expect(flatten).toContain("Familie Export");
  expect(flatten).toContain("Export-Trip");
});

// Hinweis: Cloud-Sync (Code erzeugen / mit Code beitreten) wird hier NICHT
// getestet — der Cloudflare-Worker ist nur im Production-Deploy verfügbar.
// In-App-Import via File-Picker testen wir bewusst nicht: das setFiles-API
// triggert zwar den File-Input, der Confirm-Dialog würde aber bei jedem
// Spec den localStorage komplett überschreiben — Risiko für Side-Effects
// und nicht prioritärer Pfad.
