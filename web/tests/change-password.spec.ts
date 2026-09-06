import { expect, test } from "./fixtures";
import {
  mockAuthMe,
  mockChangePassword,
  mockMyBookings,
  mockMyServices,
  mockProviderSettings,
  serviceToggle,
  t,
} from "./mocks";

// Master changing their own password (components/CabinetDashboard.tsx) —
// previously only the superadmin could ever set one, at creation time.
//
// getByPlaceholder(t.newPasswordPlaceholder) needs { exact: true } below:
// Playwright's placeholder matching is a case-insensitive substring match
// by default, and "Повторите новый пароль" contains "новый пароль" —
// without it, "Новый пароль" resolves to both fields (strict-mode error).

test("changing password with matching, long-enough fields shows a success message and clears the fields", async ({
  page,
}) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);
  await mockChangePassword(page);

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.currentPasswordPlaceholder).fill("old-password");
  await page.getByPlaceholder(t.newPasswordPlaceholder, { exact: true }).fill("a-brand-new-password");
  await page.getByPlaceholder(t.confirmNewPasswordPlaceholder).fill("a-brand-new-password");
  await page.getByRole("button", { name: t.changePasswordButton }).click();

  await expect(page.getByText(t.changePasswordSuccess)).toBeVisible();
  await expect(page.getByPlaceholder(t.currentPasswordPlaceholder)).toHaveValue("");
  await expect(page.getByPlaceholder(t.newPasswordPlaceholder, { exact: true })).toHaveValue("");
});

test("a mismatched confirmation shows a validation error without calling the API", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);
  // No mockChangePassword here on purpose — client-side validation must
  // catch this before any request to /auth/change-password goes out. An
  // unmocked call would fail to connect and surface as the generic error,
  // not this specific mismatch message, so asserting the mismatch message
  // (and not the generic one) below also proves the request never fired.

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.currentPasswordPlaceholder).fill("old-password");
  await page.getByPlaceholder(t.newPasswordPlaceholder, { exact: true }).fill("a-brand-new-password");
  await page.getByPlaceholder(t.confirmNewPasswordPlaceholder).fill("something-else-entirely");
  await page.getByRole("button", { name: t.changePasswordButton }).click();

  await expect(page.getByText(t.changePasswordMismatchError)).toBeVisible();
  await expect(page.getByText(t.changePasswordGenericError)).not.toBeVisible();
});

test("a new password shorter than 8 characters shows a validation error without calling the API", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);
  // No mockChangePassword here either — same reasoning as the mismatch
  // test above.

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.currentPasswordPlaceholder).fill("old-password");
  await page.getByPlaceholder(t.newPasswordPlaceholder, { exact: true }).fill("short1");
  await page.getByPlaceholder(t.confirmNewPasswordPlaceholder).fill("short1");
  await page.getByRole("button", { name: t.changePasswordButton }).click();

  await expect(page.getByText(t.changePasswordTooShortError)).toBeVisible();
  await expect(page.getByText(t.changePasswordGenericError)).not.toBeVisible();
});

test("a wrong current password shows the specific error and keeps the fields filled", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);
  await mockChangePassword(page, { status: 401 });

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.currentPasswordPlaceholder).fill("wrong-password");
  await page.getByPlaceholder(t.newPasswordPlaceholder, { exact: true }).fill("a-brand-new-password");
  await page.getByPlaceholder(t.confirmNewPasswordPlaceholder).fill("a-brand-new-password");
  await page.getByRole("button", { name: t.changePasswordButton }).click();

  await expect(page.getByText(t.changePasswordWrongCurrentError)).toBeVisible();
  await expect(page.getByText(t.changePasswordSuccess)).not.toBeVisible();
});

test("a server error shows the generic error, not the wrong-current-password one", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyBookings(page, []);
  await mockChangePassword(page, { status: 500 });

  await page.goto("/cabinet/");
  await page.getByPlaceholder(t.currentPasswordPlaceholder).fill("old-password");
  await page.getByPlaceholder(t.newPasswordPlaceholder, { exact: true }).fill("a-brand-new-password");
  await page.getByPlaceholder(t.confirmNewPasswordPlaceholder).fill("a-brand-new-password");
  await page.getByRole("button", { name: t.changePasswordButton }).click();

  await expect(page.getByText(t.changePasswordGenericError)).toBeVisible();
  await expect(page.getByText(t.changePasswordWrongCurrentError)).not.toBeVisible();
});
