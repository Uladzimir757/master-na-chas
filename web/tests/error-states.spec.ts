import { expect, test } from "./fixtures";
import { mockAvailability, mockCatalog, SERVICE, t } from "./mocks";

test("catalog load failure shows a message, not a blank page", async ({ page }) => {
  await mockCatalog(page, { servicesStatus: 500 });

  await page.goto("/");

  await expect(page.getByText(t.catalogLoadError)).toBeVisible();
});

test("slots load failure shows a message but keeps the page usable", async ({ page }) => {
  await mockCatalog(page);
  await mockAvailability(page, 500);

  await page.goto("/");

  // the service header still renders — only the slot list degraded, not the
  // whole page
  await expect(page.getByRole("heading", { name: SERVICE.name })).toBeVisible();
  await expect(page.getByText(t.slotsLoadError)).toBeVisible();
});
