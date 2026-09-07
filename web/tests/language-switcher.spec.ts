import { expect, test } from "./fixtures";
import { mockCatalog } from "./mocks";

// pl/en language switch (this segment) — ru/uk were the original launch
// languages, turned off by explicit request. lib/locale.ts's SUPPORTED_LOCALES
// and the backend's SUPPORTED_LANGS (app/translations.py) are the two halves
// of "turn it off": nothing renders a ru/uk button any more, and a lang the
// backend doesn't recognize falls back to pl (_resolve_lang) rather than
// erroring.

test("shows only PL and EN, no RU or UK", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "PL", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "EN", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "RU", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "UK", exact: true })).toHaveCount(0);
});

test("clicking EN re-fetches translations for en and persists the choice in a cookie", async ({ page }) => {
  const requestedLangs: string[] = [];
  // Overrides tests/fixtures.ts's auto-registered translations mock —
  // Playwright matches the most-recently-registered handler first, same
  // convention as mocks.ts's own mockTranslations().
  await page.route("**/api/translations**", (route) => {
    requestedLangs.push(new URL(route.request().url()).searchParams.get("lang") ?? "");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
  await mockCatalog(page);

  await page.goto("/");
  await expect.poll(() => requestedLangs).toContain("pl");

  await page.getByRole("button", { name: "EN", exact: true }).click();

  await expect.poll(() => requestedLangs).toContain("en");
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "lang")?.value).toBe("en");
});

test("an old ?lang=ru link falls back to pl, not ru", async ({ page }) => {
  const requestedLangs: string[] = [];
  await page.route("**/api/translations**", (route) => {
    requestedLangs.push(new URL(route.request().url()).searchParams.get("lang") ?? "");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
  await mockCatalog(page);

  await page.goto("/?lang=ru");

  await expect.poll(() => requestedLangs).toContain("pl");
  expect(requestedLangs).not.toContain("ru");
});
