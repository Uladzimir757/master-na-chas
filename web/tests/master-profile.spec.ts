import { expect, test } from "./fixtures";
import { mockAuthMe, mockMyCalendar, mockMyServices, mockProviderSettings, openTab, serviceToggle, t } from "./mocks";

// Cabinet settings (15.11.2026): the master's own photo and until when the
// client may change/cancel online (max 3 h) — components/MyAvatar.tsx,
// components/ClientChangeLimit.tsx.

test("the master picks how long before the start the client can still change", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyCalendar(page, {});
  const sent: unknown[] = [];
  await page.route("**/api/providers/me/client-change-limit", async (route) => {
    const body = route.request().postDataJSON() as { minutes: number };
    sent.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "p", name: "Владимир", requires_booking_confirmation: true, call_out_fee: null,
        share_location: false, busy_started_at: null, busy_estimated_minutes: null, busy_until: null,
        client_change_min_minutes: body.minutes }),
    });
  });

  await page.goto("/cabinet/");
  await openTab(page, t.settingsTitle);
  await expect(page.getByText(t.changeLimitTitle)).toBeVisible();
  await page.getByRole("button", { name: t.changeLimitBefore(30) }).click();
  await expect(page.getByRole("button", { name: t.changeLimitBefore(30) })).toHaveAttribute("aria-pressed", "true");
  // the save button right below the limit options
  await page.getByText(t.changeLimitTitle).locator("..").getByRole("button", { name: t.settingsSave }).click();
  await expect.poll(() => sent).toEqual([{ minutes: 30 }]);
  // no option above three hours
  await expect(page.getByRole("button", { name: t.changeLimitBefore(240) })).toHaveCount(0);
});
