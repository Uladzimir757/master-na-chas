import { expect, test } from "./fixtures";
import {
  cabinetBooking,
  mockAuthMe,
  mockBookingStatusUpdate,
  mockLogin,
  mockLogout,
  mockMyBookings,
  mockMyServices,
  mockProviderSettings,
  PROVIDER,
  SERVICE,
  serviceToggle,
  t,
} from "./mocks";

// Личный кабинет мастера (/cabinet). Every test mocks /auth/me itself first
// (Cabinet.tsx fires it on mount before deciding whether to show the login
// form or the dashboard), then layers on whichever other routes that
// scenario needs.

test("shows the login form when there is no valid session", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: false });

  await page.goto("/cabinet/");

  await expect(page.getByRole("heading", { name: t.cabinetLoginTitle })).toBeVisible();
});

test("a returning master with a valid session skips straight to the dashboard", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");

  await expect(page.getByRole("heading", { name: t.cabinetTitle(PROVIDER.name) })).toBeVisible();
  await expect(page.getByRole("heading", { name: t.cabinetLoginTitle })).not.toBeVisible();
});

test("wrong credentials show the specific login error", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: false });
  await mockLogin(page, { status: 401 });

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.emailPlaceholder).fill("master@example.com");
  await page.getByPlaceholder(t.passwordPlaceholder).fill("wrong-password");
  await page.getByRole("button", { name: t.loginButton }).click();

  await expect(page.getByText(t.loginError)).toBeVisible();
  // still on the login form, not stuck on a blank/loading screen
  await expect(page.getByRole("heading", { name: t.cabinetLoginTitle })).toBeVisible();
});

test("a server error while logging in shows the generic error, not the wrong-credentials one", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: false });
  await mockLogin(page, { status: 500 });

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.emailPlaceholder).fill("master@example.com");
  await page.getByPlaceholder(t.passwordPlaceholder).fill("whatever");
  await page.getByRole("button", { name: t.loginButton }).click();

  await expect(page.getByText(t.loginGenericError)).toBeVisible();
});

test("successful login loads the dashboard with settings and bookings", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: false });
  await mockLogin(page);
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { requiresConfirmation: true });
  const booking = cabinetBooking();
  await mockMyBookings(page, [booking]);

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.emailPlaceholder).fill("master@example.com");
  await page.getByPlaceholder(t.passwordPlaceholder).fill("correct-password");
  await page.getByRole("button", { name: t.loginButton }).click();

  await expect(page.getByRole("heading", { name: t.cabinetTitle(PROVIDER.name) })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: t.requiresConfirmationLabel })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: SERVICE.name })).toBeChecked();
  await expect(page.getByText(booking.client_name, { exact: false })).toBeVisible();
  await expect(page.getByText(t.bookingStatusLabel.pending)).toBeVisible();
});

test("no bookings shows the empty-state message instead of a blank list", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");

  await expect(page.getByText(t.noBookings)).toBeVisible();
});

test("toggling the confirmation setting saves the new value", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { requiresConfirmation: true });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  const checkbox = page.getByRole("checkbox", { name: t.requiresConfirmationLabel });
  await expect(checkbox).toBeChecked();

  await checkbox.click();

  await expect(checkbox).not.toBeChecked();
  await expect(page.getByText(t.settingsSaveError)).not.toBeVisible();
});

test("a failed settings save shows an error message", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { requiresConfirmation: true, patchStatus: 500 });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  await page.getByRole("checkbox", { name: t.requiresConfirmationLabel }).click();

  await expect(page.getByText(t.settingsSaveError)).toBeVisible();
});

test("confirming a pending booking updates its status", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  const booking = cabinetBooking({ status: "pending" });
  await mockMyBookings(page, [booking]);
  await mockBookingStatusUpdate(page, () => ({ status: 200, body: cabinetBooking({ status: "confirmed" }) }));

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.confirmBookingButton }).click();

  await expect(page.getByText(t.bookingStatusLabel.confirmed)).toBeVisible();
  // confirmed bookings can still be cancelled, but not confirmed again
  await expect(page.getByRole("button", { name: t.confirmBookingButton })).not.toBeVisible();
  await expect(page.getByRole("button", { name: t.cancelBookingButton })).toBeVisible();
});

test("cancelling a booking updates its status and removes the action buttons", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  const booking = cabinetBooking({ status: "pending" });
  await mockMyBookings(page, [booking]);
  await mockBookingStatusUpdate(page, () => ({ status: 200, body: cabinetBooking({ status: "cancelled" }) }));

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.cancelBookingButton }).click();

  await expect(page.getByText(t.bookingStatusLabel.cancelled)).toBeVisible();
  await expect(page.getByRole("button", { name: t.confirmBookingButton })).not.toBeVisible();
  await expect(page.getByRole("button", { name: t.cancelBookingButton })).not.toBeVisible();
});

test("a failed booking status update shows an error message", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  const booking = cabinetBooking({ status: "pending" });
  await mockMyBookings(page, [booking]);
  await mockBookingStatusUpdate(page, () => ({ status: 403, body: { detail: "not your booking" } }));

  await page.goto("/cabinet/");
  await page.getByRole("button", { name: t.confirmBookingButton }).click();

  await expect(page.getByText(t.bookingActionError)).toBeVisible();
  // the optimistic-looking UI didn't silently flip to "confirmed" underneath the error
  await expect(page.getByText(t.bookingStatusLabel.pending)).toBeVisible();
});

test("logging out returns to the login form", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);
  await mockLogout(page);

  await page.goto("/cabinet/");
  await expect(page.getByRole("heading", { name: t.cabinetTitle(PROVIDER.name) })).toBeVisible();

  await page.getByRole("button", { name: t.logoutButton }).click();

  await expect(page.getByRole("heading", { name: t.cabinetLoginTitle })).toBeVisible();
});

// ----------------------------------------------------------------------------
// Services checklist (PUT /api/providers/me/services)
// ----------------------------------------------------------------------------

test("no active services shows the empty-state message instead of a blank checklist", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, []);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");

  await expect(page.getByText(t.noActiveServices)).toBeVisible();
});

test("turning a service on saves it", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle({ is_offered: false })]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  const checkbox = page.getByRole("checkbox", { name: SERVICE.name });
  await expect(checkbox).not.toBeChecked();

  await checkbox.click();

  await expect(checkbox).toBeChecked();
  await expect(page.getByText(t.servicesSaveError)).not.toBeVisible();
});

test("turning a service off saves it, independently of the confirmation checkbox", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle({ is_offered: true })]);
  await mockProviderSettings(page, { requiresConfirmation: true });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  const serviceCheckbox = page.getByRole("checkbox", { name: SERVICE.name });
  const confirmationCheckbox = page.getByRole("checkbox", { name: t.requiresConfirmationLabel });

  await serviceCheckbox.click();

  await expect(serviceCheckbox).not.toBeChecked();
  // toggling one didn't touch the other — they save through two different
  // endpoints (PUT .../services vs PATCH .../settings)
  await expect(confirmationCheckbox).toBeChecked();
});

test("a failed services save shows an error message", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle({ is_offered: false })], { putStatus: 500 });
  await mockProviderSettings(page);
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  await page.getByRole("checkbox", { name: SERVICE.name }).click();

  await expect(page.getByText(t.servicesSaveError)).toBeVisible();
});

// ----------------------------------------------------------------------------
// Call-out fee (part of PATCH /api/providers/me/settings)
// ----------------------------------------------------------------------------

test("setting a call-out fee saves it on blur", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { callOutFee: null });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  const feeInput = page.getByPlaceholder(t.callOutFeePlaceholder);
  await feeInput.fill("50");
  await feeInput.blur();

  // the input remounts (key={settings.call_out_fee}) once the save resolves
  // and the new value comes back from the mocked PATCH
  await expect(page.getByPlaceholder(t.callOutFeePlaceholder)).toHaveValue("50");
  await expect(page.getByText(t.settingsSaveError)).not.toBeVisible();
});

test("clearing the call-out fee saves null", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { callOutFee: 80 });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  const feeInput = page.getByPlaceholder(t.callOutFeePlaceholder);
  await expect(feeInput).toHaveValue("80");

  await feeInput.fill("");
  await feeInput.blur();

  await expect(page.getByPlaceholder(t.callOutFeePlaceholder)).toHaveValue("");
});

test("a failed call-out fee save shows an error message", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page, { callOutFee: null, patchStatus: 500 });
  await mockMyBookings(page, []);

  await page.goto("/cabinet/");
  const feeInput = page.getByPlaceholder(t.callOutFeePlaceholder);
  await feeInput.fill("50");
  await feeInput.blur();

  await expect(page.getByText(t.settingsSaveError)).toBeVisible();
});
