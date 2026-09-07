import { expect, test } from "./fixtures";
import { mockAvailability, mockCatalog, SERVICE, t } from "./mocks";

test("master list load failure shows a message, not a blank page", async ({ page }) => {
  // The home page's first fetch is now GET /api/providers (MasterPicker),
  // not /api/services — see mockCatalog's providersStatus option.
  await mockCatalog(page, { providersStatus: 500 });

  await page.goto("/");

  await expect(page.getByText(t.masterListLoadError)).toBeVisible();
});

test("a master's services load failure shows a message, not a blank page", async ({ page }) => {
  await mockCatalog(page, { providerServicesStatus: 500 });

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();

  await expect(page.getByText(t.masterServicesLoadError)).toBeVisible();
});

test("slots load failure shows a message but keeps the page usable", async ({ page }) => {
  await mockCatalog(page);
  await mockAvailability(page, 500);

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();

  // the service header still renders — only the slot list degraded, not the
  // whole page
  await expect(page.getByRole("heading", { name: SERVICE.name })).toBeVisible();
  await expect(page.getByText(t.slotsLoadError)).toBeVisible();
});
