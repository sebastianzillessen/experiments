import { expect, test, type Page } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily, tripItemRow } from "./helpers";

/**
 * Nur-Lese-Trip-Share: Link erstellen im TripDetail, öffentliche Ansicht
 * unter #/share/:code (ohne Login), Auto-Update via TripShareRunner und
 * Widerruf des Links.
 *
 * Der Worker wird per page.route gemockt — die Tests laufen gegen den
 * Vite-Dev-Server ohne Cloudflare-Backend. Der Mock bildet das
 * KV-Verhalten nach: POST vergibt einen Code, PUT aktualisiert nur
 * existierende Codes, GET liefert den gespeicherten Snapshot, DELETE
 * entfernt ihn.
 */

const CODE = "TESTCODE22"; // 10 Zeichen, wie vom Worker vergeben

async function mockTripShareApi(page: Page): Promise<Map<string, string>> {
  const store = new Map<string, string>();
  await page.route("**/api/packliste/trip-share**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const m = url.pathname.match(/\/api\/packliste\/trip-share\/([A-Z2-9]+)$/);
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (req.method() === "POST") {
      store.set(CODE, req.postData() ?? "");
      return json(201, { code: CODE, expiresInDays: 30 });
    }
    if (req.method() === "PUT" && m) {
      if (!store.has(m[1])) return json(404, { error: "Code nicht gefunden" });
      store.set(m[1], req.postData() ?? "");
      return json(200, { ok: true });
    }
    if (req.method() === "GET" && m) {
      const value = store.get(m[1]);
      if (value === undefined) {
        return json(404, { error: "Link nicht gefunden oder abgelaufen." });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: value });
    }
    if (req.method() === "DELETE" && m) {
      store.delete(m[1]);
      return json(200, { ok: true });
    }
    return json(405, { error: "Method not allowed" });
  });
  return store;
}

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Trip teilen: Link erstellen, Nur-Lese-Ansicht zeigt Live-Stand", async ({
  page,
}) => {
  await mockTripShareApi(page);

  await setupNewFamily(page, {
    familyName: "Familie Share",
    persons: ["Anna"],
    preset: "Strand-Wochenende",
  });
  await createTrip(page, {
    name: "Sardinien",
    days: 5,
    conditions: ["Sonne"],
  });

  // --- Share-Dialog öffnen und Link erstellen ---
  await page.getByRole("button", { name: "Teilen", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Trip teilen")).toBeVisible();
  await dialog.getByRole("button", { name: "Nur-Lese-Link erstellen" }).click();
  await expect(dialog.getByText(new RegExp(`#/share/${CODE}`))).toBeVisible();
  await dialog.getByRole("button", { name: "Schließen" }).click();

  // --- Item packen → TripShareRunner pusht den neuen Stand (debounced) ---
  const putUpdate = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().includes(`/api/packliste/trip-share/${CODE}`),
    { timeout: 10_000 },
  );
  const sonnencreme = tripItemRow(page, "Sonnencreme");
  await sonnencreme.getByRole("button", { name: "Mehr", exact: true }).click();
  await putUpdate;

  // --- Öffentliche Nur-Lese-Ansicht ---
  await page.goto(`/packliste/#/share/${CODE}`);
  await expect(page.getByText("Nur-Lese-Ansicht")).toBeVisible();
  await expect(page.getByText("Familie Share")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sardinien" })).toBeVisible();
  // Gepackter Stand aus dem PUT-Update ist sichtbar:
  await expect(page.getByText("Sonnencreme")).toBeVisible();
  await expect(page.getByText("1/1")).toBeVisible();
  // Keinerlei Mutations-UI in der geteilten Ansicht:
  await expect(page.getByRole("button", { name: "Mehr", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Neuer Trip" })).toHaveCount(0);
});

test("Geteilte Ansicht rendert ohne Login (frischer Browser)", async ({ page }) => {
  const store = await mockTripShareApi(page);
  store.set(CODE, JSON.stringify({
    schema: "packliste-trip-v1",
    sharedAt: "2026-07-01T10:00:00.000Z",
    familyName: "Familie Extern",
    trip: {
      id: "t1",
      familyId: "f1",
      name: "Berge",
      durationDays: 3,
      conditions: [],
      hasWasher: false,
      createdBy: "u1",
      createdAt: "2026-06-01T10:00:00.000Z",
    },
    items: [
      {
        id: "i1",
        tripId: "t1",
        familyId: "f1",
        name: "Wanderschuhe",
        category: "Schuhe",
        baseQuantity: 1,
        unit: "per_trip",
        washable: false,
        quantity: 1,
        packedQty: 0,
        isPacked: false,
        sortOrder: 0,
      },
    ],
    persons: [],
    categories: [],
    conditions: [],
  }));

  // Direkt auf den Share-Link — LocalStorage ist leer, kein Login nötig.
  await page.goto(`/packliste/#/share/${CODE}`);
  await expect(page.getByText("Nur-Lese-Ansicht")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Berge" })).toBeVisible();
  await expect(page.getByText("Wanderschuhe")).toBeVisible();
  // Kein AuthGate:
  await expect(page.getByRole("button", { name: "Neu anlegen" })).toHaveCount(0);
});

test("Unbekannter Code zeigt Fehlermeldung; Widerruf deaktiviert Link", async ({
  page,
}) => {
  const store = await mockTripShareApi(page);

  // --- Unbekannter Code ---
  await page.goto("/packliste/#/share/UNBEKANNT9");
  await expect(page.getByText("Link nicht gefunden oder abgelaufen.")).toBeVisible();

  // --- Link erstellen und wieder widerrufen ---
  await page.goto("/packliste/");
  await setupNewFamily(page, { familyName: "Familie Revoke", persons: ["Anna"] });
  await createTrip(page, { name: "Kurztrip", days: 2 });

  await page.getByRole("button", { name: "Teilen", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Nur-Lese-Link erstellen" }).click();
  await expect(dialog.getByText(new RegExp(`#/share/${CODE}`))).toBeVisible();
  expect(store.has(CODE)).toBe(true);

  page.once("dialog", (d) => void d.accept()); // confirm() bestätigen
  await dialog.getByRole("button", { name: "Link deaktivieren" }).click();

  // Dialog fällt in den "noch nicht geteilt"-Zustand zurück …
  await expect(
    dialog.getByRole("button", { name: "Nur-Lese-Link erstellen" }),
  ).toBeVisible();
  // … und der Remote-Eintrag ist gelöscht.
  await expect.poll(() => store.has(CODE)).toBe(false);
});
