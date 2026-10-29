import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  adminMaster,
  mockAdminMe,
  mockAdminMasters,
  mockAuthMe,
  mockMyCalendar,
  mockMyServices,
  mockProviderSettings,
  openTab,
  serviceToggle,
  t,
} from "./mocks";

// Обе страницы аналитики (кабинет мастера и суперадминка) грузят данные
// только при открытии и по кнопке «Применить»/Enter — не на каждую правку
// поля даты (docs/analytics-apply-button-task.md).

/** Records every request URL to `pattern`, answering with an empty report. */
async function recordRequests(page: Page, pattern: string, body: unknown): Promise<URL[]> {
  const seen: URL[] = [];
  await page.route(pattern, (route) => {
    seen.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return seen;
}

test.describe("master cabinet analytics", () => {
  async function openAnalytics(page: Page) {
    await mockAuthMe(page, { loggedIn: true });
    await mockMyServices(page, [serviceToggle()]);
    await mockProviderSettings(page);
    await mockMyCalendar(page, {});
    const seen = await recordRequests(page, "**/api/providers/me/analytics?**", {
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      services: [],
    });
    await page.goto("/cabinet/");
    await openTab(page, t.tabAnalytics);
    await expect.poll(() => seen.length).toBe(1);
    return seen;
  }

  test("editing dates doesn't refetch until Apply is pressed", async ({ page }) => {
    const seen = await openAnalytics(page);
    const [from, to] = await page.locator('input[type="date"]').all();

    await from.fill("2026-09-01");
    await to.fill("2026-09-20");
    await to.fill("2026-09-30");
    await page.waitForTimeout(300);
    expect(seen).toHaveLength(1);

    await page.getByRole("button", { name: t.analyticsApply }).click();
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1].searchParams.get("date_from")).toBe("2026-09-01");
    expect(seen[1].searchParams.get("date_to")).toBe("2026-09-30");
  });

  test("Enter in a date field applies too", async ({ page }) => {
    const seen = await openAnalytics(page);
    const [from] = await page.locator('input[type="date"]').all();

    await from.fill("2026-09-05");
    await from.press("Enter");
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1].searchParams.get("date_from")).toBe("2026-09-05");
  });

  test("Apply is disabled while the period is reversed", async ({ page }) => {
    await openAnalytics(page);
    const [from, to] = await page.locator('input[type="date"]').all();

    await from.fill("2026-09-20");
    await to.fill("2026-09-10");
    await expect(page.getByRole("button", { name: t.analyticsApply })).toBeDisabled();

    await to.fill("2026-09-25");
    await expect(page.getByRole("button", { name: t.analyticsApply })).toBeEnabled();
  });
});

test.describe("superadmin analytics", () => {
  test("filters apply only on «Применить»", async ({ page }) => {
    await mockAdminMe(page, { isAdmin: true });
    await mockAdminMasters(page, [adminMaster({ name: "Владимир", provider_id: "p1" })]);
    // registered after mockAdminMasters' own default route, so it wins
    const seen = await recordRequests(page, "**/admin/analytics?**", {
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      masters: [],
      services: [],
    });

    await page.goto("/admin/");
    await expect.poll(() => seen.length).toBe(1);

    const [from, to] = await page.locator('input[type="date"]').all();
    await from.fill("2026-09-01");
    await to.fill("2026-09-15");
    await page.getByRole("combobox").selectOption("p1");
    await page.waitForTimeout(300);
    expect(seen).toHaveLength(1);

    await page.getByRole("button", { name: "Применить" }).click();
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1].searchParams.get("date_from")).toBe("2026-09-01");
    expect(seen[1].searchParams.get("date_to")).toBe("2026-09-15");
    expect(seen[1].searchParams.get("provider_id")).toBe("p1");

    await to.fill("2026-08-01");
    await expect(page.getByRole("button", { name: "Применить" })).toBeDisabled();
  });
});
