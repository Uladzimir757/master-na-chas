import { expect, test } from "./fixtures";
import { mockAuthMe, mockMyBookings, mockMyServices, mockProviderSettings, mockWorkingHours, serviceToggle, t } from "./mocks";

// "Мои рабочие часы" (components/WorkingHoursEditor.tsx) — weekly template
// (multiple intervals per weekday) + per-date exceptions (day off / custom
// hours). mockWorkingHours (tests/mocks.ts) backs GET/PUT
// /api/providers/me/working-hours and PUT/DELETE .../exceptions/{date} with
// in-memory state, matching the real backend's replace/upsert semantics.

const FUTURE_DATE = "2027-06-14";

async function setupCabinet(page: Parameters<typeof mockAuthMe>[0]) {
  await mockAuthMe(page, { loggedIn: true });
  await mockProviderSettings(page);
  await mockMyServices(page, [serviceToggle()]);
  await mockMyBookings(page, []);
}

test("an empty weekly template shows every weekday as a day off", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, {});

  await page.goto("/cabinet/");

  // Scoped to the weekly-template <ul> specifically (getByText's default
  // match is case-insensitive substring, so an unscoped page-wide query
  // also picks up the exception-mode "Выходной" toggle button below and
  // the lower-cased "...дату — выходной или другие часы." hint text in
  // the Особые дни section — both unrelated to this grid). Scoping by
  // the section heading first, same convention as the add-exception
  // <form> lookups below, rather than relying on this being the page's
  // first <ul> (true today, but fragile if a section above ever grows one).
  const weeklyTemplateList = page
    .locator("section")
    .filter({ hasText: t.workingHoursTitle })
    .locator("ul")
    .first();
  await expect(weeklyTemplateList.getByText(t.workingHoursDayOff, { exact: true })).toHaveCount(7);
});

test("an existing weekly template shows its saved intervals, not a day-off label", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, { slots: [{ weekday: 0, start_time: "09:00:00", end_time: "18:00:00" }] });

  await page.goto("/cabinet/");

  const mondayItem = page.locator("li").filter({ hasText: t.weekdayLabels[0] });
  await expect(mondayItem.getByText(t.workingHoursDayOff)).not.toBeVisible();
  await expect(mondayItem.locator('input[type="time"]').nth(0)).toHaveValue("09:00");
  await expect(mondayItem.locator('input[type="time"]').nth(1)).toHaveValue("18:00");
  // Only Monday has an interval — every other weekday is still a day off.
  // Scoped to the weekly-template <ul> — see comment in the previous test.
  const weeklyTemplateList = page
    .locator("section")
    .filter({ hasText: t.workingHoursTitle })
    .locator("ul")
    .first();
  await expect(weeklyTemplateList.getByText(t.workingHoursDayOff, { exact: true })).toHaveCount(6);
});

test("adding an interval clears the day-off label immediately, and saving persists it", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, {});

  await page.goto("/cabinet/");
  const mondayItem = page.locator("li").filter({ hasText: t.weekdayLabels[0] });

  await mondayItem.getByRole("button", { name: t.workingHoursAddIntervalButton }).click();
  // Local edit, before any save — the grid updates immediately.
  await expect(mondayItem.getByText(t.workingHoursDayOff)).not.toBeVisible();

  await page.getByRole("button", { name: t.workingHoursSaveButton }).click();
  await expect(page.getByText(t.workingHoursSaveError)).not.toBeVisible();

  // Reload to prove it round-tripped through the (stateful) PUT, not just
  // local React state.
  await page.reload();
  const mondayAfterReload = page.locator("li").filter({ hasText: t.weekdayLabels[0] });
  await expect(mondayAfterReload.getByText(t.workingHoursDayOff)).not.toBeVisible();
});

test("removing the only interval on a day and saving turns it back into a day off", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, { slots: [{ weekday: 0, start_time: "09:00:00", end_time: "18:00:00" }] });

  await page.goto("/cabinet/");
  const mondayItem = page.locator("li").filter({ hasText: t.weekdayLabels[0] });

  await mondayItem.getByRole("button", { name: t.workingHoursRemoveIntervalLabel }).click();
  await expect(mondayItem.getByText(t.workingHoursDayOff)).toBeVisible();

  await page.getByRole("button", { name: t.workingHoursSaveButton }).click();
  await expect(page.getByText(t.workingHoursSaveError)).not.toBeVisible();
});

test("a failed template save shows an error message", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, { putStatus: 500 });

  await page.goto("/cabinet/");
  const mondayItem = page.locator("li").filter({ hasText: t.weekdayLabels[0] });
  await mondayItem.getByRole("button", { name: t.workingHoursAddIntervalButton }).click();
  await page.getByRole("button", { name: t.workingHoursSaveButton }).click();

  await expect(page.getByText(t.workingHoursSaveError)).toBeVisible();
});

test("no exceptions shows the empty-state message", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, {});

  await page.goto("/cabinet/");

  await expect(page.getByText(t.workingHoursNoExceptions)).toBeVisible();
  await expect(page.getByRole("button", { name: t.workingHoursDeleteExceptionLabel })).not.toBeVisible();
});

test("adding a day-off exception shows it in the list", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, {});

  await page.goto("/cabinet/");
  const form = page.locator("form").filter({ hasText: t.workingHoursAddExceptionTitle });

  await form.locator('input[type="date"]').fill(FUTURE_DATE);
  await form.getByRole("button", { name: t.workingHoursExceptionDayOffOption }).click();
  await form.getByRole("button", { name: t.workingHoursAddExceptionButton }).click();

  await expect(page.getByText(t.workingHoursNoExceptions)).not.toBeVisible();
  await expect(page.getByRole("button", { name: t.workingHoursDeleteExceptionLabel })).toHaveCount(1);
});

test("adding a custom-hours exception shows the hours range", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, {});

  await page.goto("/cabinet/");
  const form = page.locator("form").filter({ hasText: t.workingHoursAddExceptionTitle });

  await form.locator('input[type="date"]').fill(FUTURE_DATE);
  await form.getByRole("button", { name: t.workingHoursExceptionCustomHoursOption }).click();
  await form.locator('input[type="time"]').nth(0).fill("10:00");
  await form.locator('input[type="time"]').nth(1).fill("14:00");
  await form.getByRole("button", { name: t.workingHoursAddExceptionButton }).click();

  await expect(page.getByText("10:00–14:00")).toBeVisible();
});

test("deleting an exception removes it and restores the empty-state message", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, {
    exceptions: [{ id: "exc-1", date: FUTURE_DATE, is_available: false, start_time: null, end_time: null, reason: null }],
  });

  await page.goto("/cabinet/");
  await expect(page.getByRole("button", { name: t.workingHoursDeleteExceptionLabel })).toHaveCount(1);

  await page.getByRole("button", { name: t.workingHoursDeleteExceptionLabel }).click();

  await expect(page.getByText(t.workingHoursNoExceptions)).toBeVisible();
});

test("a failed exception save shows an error message", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, { exceptionPutStatus: 500 });

  await page.goto("/cabinet/");
  const form = page.locator("form").filter({ hasText: t.workingHoursAddExceptionTitle });
  await form.locator('input[type="date"]').fill(FUTURE_DATE);
  await form.getByRole("button", { name: t.workingHoursAddExceptionButton }).click();

  await expect(page.getByText(t.workingHoursExceptionSaveError)).toBeVisible();
});

test("a failed exception delete shows an error message and keeps the exception", async ({ page }) => {
  await setupCabinet(page);
  await mockWorkingHours(page, {
    exceptions: [{ id: "exc-1", date: FUTURE_DATE, is_available: false, start_time: null, end_time: null, reason: null }],
    exceptionDeleteStatus: 500,
  });

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.workingHoursDeleteExceptionLabel }).click();

  await expect(page.getByText(t.workingHoursExceptionDeleteError)).toBeVisible();
  await expect(page.getByRole("button", { name: t.workingHoursDeleteExceptionLabel })).toHaveCount(1);
});
