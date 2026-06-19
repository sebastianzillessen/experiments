import { expect, test } from "@playwright/test";

// UI flows share one server-side DB; run them in order.
test.describe.serial("relationship map", () => {
  test("loads with an empty map and a centre node", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".self-label")).toHaveText("Me");
    await expect(page.locator(".empty-hint")).toBeVisible();
    await expect(page.locator(".map-node")).toHaveCount(0);
  });

  test("rename yourself (self node)", async ({ page }) => {
    await page.goto("/");
    const input = page.getByLabel("Your name");
    await input.fill("Sebastian");
    await input.blur();
    await expect(page.locator(".self-label")).toHaveText("Sebastian");
  });

  test("add a person and see them on the map", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ Add person" }).click();
    const dialog = page.getByRole("dialog", { name: "Add person" });
    await dialog.getByLabel("Name").fill("Alex");
    await dialog.getByRole("button", { name: "Add" }).click();

    const node = page.locator(".map-node", { hasText: "Alex" });
    await expect(node).toHaveCount(1);
  });

  test("change closeness and record history", async ({ page }) => {
    await page.goto("/");
    await page.locator(".map-node", { hasText: "Alex" }).click();
    const panel = page.locator(".person-panel");
    await expect(panel.getByRole("heading", { name: "Alex" })).toBeVisible();

    await panel.locator(".rating-editor input[type=range]").fill("9");
    await panel.getByRole("button", { name: "Save closeness" }).click();

    // History now has the creation entry plus the change.
    await expect(panel.locator(".history-list li")).toHaveCount(2);
    await expect(panel.locator(".rating-trend circle")).toHaveCount(2);
  });

  test("manage groups and block deleting one in use", async ({ page }) => {
    await page.goto("/");
    const legend = page.locator(".legend");
    await legend.getByRole("button", { name: "+ Add" }).click();
    await legend.getByPlaceholder("Group name").fill("Neighbours");
    await legend.getByRole("button", { name: "Add group" }).click();
    await expect(
      legend.locator(".legend-name", { hasText: "Neighbours" }),
    ).toBeVisible();

    // Alex defaults to the first group (Partner) — deleting it must be blocked.
    await legend
      .locator("li", { hasText: "Partner" })
      .getByTitle("Delete group")
      .click();
    await expect(legend.locator(".error")).toContainText("in use");
  });

  test("archive removes the person from the live map", async ({ page }) => {
    await page.goto("/");
    await page.locator(".map-node", { hasText: "Alex" }).click();
    await page
      .locator(".person-panel")
      .getByRole("button", { name: "Archive person" })
      .click();
    await expect(page.locator(".map-node", { hasText: "Alex" })).toHaveCount(0);
  });

  test("data persists across reloads", async ({ page }) => {
    await page.goto("/");
    // The renamed self node survives a reload (proves the SQLite backend).
    await expect(page.locator(".self-label")).toHaveText("Sebastian");
  });
});
