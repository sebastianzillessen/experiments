import { expect, test } from "@playwright/test";

// Runs after app.spec.ts, before history.spec.ts (alphabetical). Shares the
// server DB but uses its own people, so it doesn't disturb the other specs.
test.describe.serial("classification & filters", () => {
  test("classify a backlog person into a group, then see them on the map", async ({ page }) => {
    await page.goto("/");

    // Ensure an "Uncategorised" backlog group exists.
    const legend = page.locator(".legend");
    if ((await legend.locator(".legend-name", { hasText: "Uncategorised" }).count()) === 0) {
      await legend.getByRole("button", { name: "+ Add" }).click();
      await legend.getByPlaceholder("Group name").fill("Uncategorised");
      await legend.getByRole("button", { name: "Add group" }).click();
      await expect(legend.locator(".legend-name", { hasText: "Uncategorised" })).toBeVisible();
    }

    // Add a person into the backlog.
    await page.getByRole("button", { name: "+ Add person" }).click();
    const dialog = page.getByRole("dialog", { name: "Add person" });
    await dialog.getByLabel("Name").fill("Sortme");
    await dialog.getByLabel("Group").selectOption({ label: "Uncategorised" });
    await dialog.getByRole("button", { name: "Add" }).click();

    // It shows up in the Classify backlog.
    await page.getByRole("button", { name: "Classify" }).click();
    const row = page.locator(".classify-row", { hasText: "Sortme" });
    await expect(row).toHaveCount(1);

    // Assigning a group removes it from the backlog.
    await row.getByRole("button", { name: "Family" }).click();
    await expect(page.locator(".classify-row", { hasText: "Sortme" })).toHaveCount(0);

    // Back on the map it's now a visible node.
    await page.getByRole("button", { name: "Map" }).click();
    await expect(page.locator(".map-node", { hasText: "Sortme" })).toHaveCount(1);
  });

  test("min-closeness filter hides people below the threshold", async ({ page }) => {
    await page.goto("/");
    const node = page.locator(".map-node", { hasText: "Sortme" }); // added above, rating 5
    await expect(node).toHaveCount(1);

    await page.locator(".filter-bar input[type=range]").fill("10");
    await expect(node).toHaveCount(0);

    // Lowering it again brings them back.
    await page.locator(".filter-bar input[type=range]").fill("1");
    await expect(node).toHaveCount(1);
  });
});
