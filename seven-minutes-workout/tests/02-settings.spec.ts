import { expect, test } from "@playwright/test";
import { freshPage, gotoApp, readProgress } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("gender choice is saved and survives a reload", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "Einstellungen" }).click();

  // Default is male; switch to female.
  await page.getByRole("button", { name: /Weiblich/ }).click();

  await expect.poll(async () => (await readProgress(page)).settings.gender).toBe("female");

  // Persisted across reload.
  await page.reload();
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const female = page.getByRole("button", { name: /Weiblich/ });
  await expect(female).toHaveClass(/is-selected/);
});

test("sound toggle persists", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "Einstellungen" }).click();

  const sound = page.getByRole("checkbox").last();
  await expect(sound).toBeChecked(); // default on
  await sound.uncheck();

  await expect.poll(async () => (await readProgress(page)).settings.soundEnabled).toBe(false);
});
