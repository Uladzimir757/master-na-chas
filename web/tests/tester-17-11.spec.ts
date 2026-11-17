import { expect, test } from "./fixtures";
import { mockAuthMe, mockMyCalendar, mockMyServices, mockProviderSettings, openTab, serviceToggle, t } from "./mocks";

// Tester notes 17.11.2026: dates in the phone's language instead of the
// page's; the cabinet's «back to booking» hidden under the day strip.

test.use({ locale: "ru-RU" }); // a Russian phone, as the tester's

async function openCabinet(page: import("@playwright/test").Page) {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyCalendar(page, {});
  await page.route("**/api/providers/me/analytics?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ date_from: "2026-10-19", date_to: "2026-11-17", services: [] }) }),
  );
  await page.goto("/cabinet/");
}

test("analytics dates are written in the page language, not the phone's", async ({ page }) => {
  await openCabinet(page);
  await openTab(page, t.tabAnalytics);
  const input = page.locator('input[type="date"]').first();
  const value = await input.inputValue(); // YYYY-MM-DD
  const polish = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
  await expect(page.getByText(polish, { exact: true }).first()).toBeVisible();
});

test("«back to booking» sits above the cabinet and can be tapped", async ({ page }) => {
  await openCabinet(page);
  const back = page.getByRole("link", { name: t.backToBooking });
  await expect(back).toBeVisible();
  const box = await back.boundingBox();
  expect(box!.y).toBeLessThan(200);
  await back.click();
  await expect(page).toHaveURL(/\/$/);
});
