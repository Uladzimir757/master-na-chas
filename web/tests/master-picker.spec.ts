import { expect, test } from "./fixtures";
import { mockAvailability, mockCatalog, PROVIDER, providerServiceOffering, SERVICE, t } from "./mocks";

// Home page opens on a list of masters (sorted by rating server-side, this
// component just renders whatever order it's given) instead of jumping
// straight into a calendar — components/MasterPicker.tsx,
// components/BookingFlow.tsx.

const SERVICE_B = providerServiceOffering({
  id: "66666666-6666-6666-6666-666666666666",
  name: "Сборка мебели",
  duration_minutes: 90,
  price_min: 150,
  price_max: 300,
  description: "Со своим инструментом",
});

test("shows a master's rating, or 'no rating yet' when unset", async ({ page }) => {
  const rated = { ...PROVIDER, id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Рейтинговый", rating: 4.8, rating_count: 12 };
  const unrated = { ...PROVIDER, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "Новичок", rating: null, rating_count: 0 };
  await mockCatalog(page, { providers: [rated, unrated] });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: t.pickMasterTitle })).toBeVisible();
  await expect(page.getByText(t.ratingValue(4.8, 12))).toBeVisible();
  await expect(page.getByText(t.noRatingYet)).toBeVisible();
});

test("a master with several services shows a picker; choosing one opens the slot calendar", async ({ page }) => {
  await mockCatalog(page, { providerServices: { [PROVIDER.id]: [providerServiceOffering(), SERVICE_B] } });
  await mockAvailability(page, []);

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();

  await expect(page.getByText(SERVICE.name)).toBeVisible();
  await expect(page.getByText(SERVICE_B.name)).toBeVisible();

  await page.getByText(SERVICE_B.name).click();

  await expect(page.getByRole("heading", { name: SERVICE_B.name })).toBeVisible();
  await expect(page.getByText(SERVICE_B.description!)).toBeVisible();
});

test("a master with no offered services shows the empty state", async ({ page }) => {
  await mockCatalog(page, { providerServices: { [PROVIDER.id]: [] } });

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();

  await expect(page.getByText(t.noServicesOffered)).toBeVisible();
});

test("changing service returns to that master's own service list, not another master's", async ({ page }) => {
  await mockCatalog(page, { providerServices: { [PROVIDER.id]: [providerServiceOffering(), SERVICE_B] } });
  await mockAvailability(page, []);

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  await page.getByText(SERVICE_B.name).click();
  await expect(page.getByRole("heading", { name: SERVICE_B.name })).toBeVisible();

  await page.getByRole("button", { name: t.changeService }).click();

  await expect(page.getByText(SERVICE.name)).toBeVisible();
  await expect(page.getByText(SERVICE_B.name)).toBeVisible();
});

test("back to masters returns to the picker", async ({ page }) => {
  await mockCatalog(page, { providerServices: { [PROVIDER.id]: [providerServiceOffering(), SERVICE_B] } });

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  await expect(page.getByText(SERVICE_B.name)).toBeVisible();

  await page.getByRole("button", { name: t.backToMasters }).click();

  await expect(page.getByRole("heading", { name: t.pickMasterTitle })).toBeVisible();
});
