import { expect, test } from "@playwright/test";
import { APP_PATH, freshPage, gotoApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("exposes a valid web app manifest with the correct scope", async ({ page }) => {
  await gotoApp(page);

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();

  const res = await page.request.get(href!);
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toContain("7-Minuten Workout");
  expect(manifest.scope).toBe(APP_PATH);
  expect(manifest.start_url).toBe(APP_PATH);
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});

test("sets the theme color and apple touch icon meta tags", async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ff5a3c");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("registers a service worker", async ({ page }) => {
  await gotoApp(page);
  await expect
    .poll(
      () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});
