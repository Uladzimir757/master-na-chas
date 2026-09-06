import { formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import {
  mockAuthMe,
  mockMyBookings,
  mockMyServices,
  mockProviderSettings,
  serviceToggle,
  t,
} from "./mocks";

// "Занят сейчас" (components/CabinetDashboard.tsx) — a general busy toggle,
// independent of any specific booking. mockProviderSettings (tests/mocks.ts)
// backs GET /api/providers/me and all three /api/providers/me/busy/*
// endpoints with the same in-memory state, so start/estimate/finish here
// behave like the real backend's manual override on top of bookings.

const BUSY_START = "2027-06-07T10:00:00Z";
const BUSY_ESTIMATE_MINUTES = 60;
const BUSY_UNTIL = new Date(new Date(BUSY_START).getTime() + (BUSY_ESTIMATE_MINUTES + 30) * 60_000).toISOString();

test("not busy shows the start button, not the busy status", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");

  await expect(page.getByRole("button", { name: t.startBusyButton })).toBeVisible();
  await expect(page.getByRole("button", { name: t.finishBusyButton })).not.toBeVisible();
});

test("pressing start shows the busy status and the finish button", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.startBusyButton }).click();

  await expect(page.getByRole("button", { name: t.finishBusyButton })).toBeVisible();
  await expect(page.getByText(t.busyStatusSince(formatTime(BUSY_START, "pl")))).toBeVisible();
  // No estimate yet — open-ended, not a finite "until" time.
  await expect(page.getByText(t.busyOpenEndedNote)).toBeVisible();
});

test("busy with an estimate already set shows the until time instead of the open-ended note", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, {
    busyStartedAt: BUSY_START,
    busyEstimatedMinutes: BUSY_ESTIMATE_MINUTES,
    busyUntil: BUSY_UNTIL,
  });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");

  await expect(page.getByText(t.busyUntilText(formatTime(BUSY_UNTIL, "pl")))).toBeVisible();
  await expect(page.getByText(t.busyOpenEndedNote)).not.toBeVisible();
});

test("setting an estimate while busy saves it and shows the computed until time", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { busyStartedAt: BUSY_START });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  await expect(page.getByText(t.busyOpenEndedNote)).toBeVisible();

  const estimateInput = page.getByPlaceholder(t.busyEstimatePlaceholder);
  await estimateInput.fill(String(BUSY_ESTIMATE_MINUTES));
  await estimateInput.blur();

  await expect(page.getByText(t.busyUntilText(formatTime(BUSY_UNTIL, "pl")))).toBeVisible();
  await expect(page.getByText(t.busyActionError)).not.toBeVisible();
});

test("clearing the estimate returns to the open-ended note", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, {
    busyStartedAt: BUSY_START,
    busyEstimatedMinutes: BUSY_ESTIMATE_MINUTES,
    busyUntil: BUSY_UNTIL,
  });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  const estimateInput = page.getByPlaceholder(t.busyEstimatePlaceholder);
  await expect(estimateInput).toHaveValue(String(BUSY_ESTIMATE_MINUTES));

  await estimateInput.fill("");
  await estimateInput.blur();

  await expect(page.getByText(t.busyOpenEndedNote)).toBeVisible();
});

test("pressing finish clears the busy state and shows the start button again", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, {
    busyStartedAt: BUSY_START,
    busyEstimatedMinutes: BUSY_ESTIMATE_MINUTES,
    busyUntil: BUSY_UNTIL,
  });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.finishBusyButton }).click();

  await expect(page.getByRole("button", { name: t.startBusyButton })).toBeVisible();
  await expect(page.getByRole("button", { name: t.finishBusyButton })).not.toBeVisible();
});

test("a failed start shows an error message", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { busyActionStatus: 500 });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.startBusyButton }).click();

  await expect(page.getByText(t.busyActionError)).toBeVisible();
  // Failed, so it should still be offering to start, not showing "finish".
  await expect(page.getByRole("button", { name: t.startBusyButton })).toBeVisible();
});

test("a failed finish shows an error message and keeps the busy state", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { busyStartedAt: BUSY_START, busyActionStatus: 500 });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.finishBusyButton }).click();

  await expect(page.getByText(t.busyActionError)).toBeVisible();
  await expect(page.getByRole("button", { name: t.finishBusyButton })).toBeVisible();
});
