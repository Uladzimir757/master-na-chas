import { formatTime } from "../lib/format";
import { normalizePhone } from "../lib/phone";
import { expect, test } from "./fixtures";
import {
  bookingResponse,
  mockAuthMe,
  mockAvailability,
  mockCatalog,
  mockCreateBooking,
  mockMyCalendar,
  mockMyServices,
  mockProviderSettings,
  openTab,
  serviceToggle,
  SERVICE,
  SLOT_A,
  t,
} from "./mocks";

// Телефоны (решения 12.11.2026): «1234» больше не проходит; клиент решает,
// видит ли мастер его номер; номер мастера — по его настройке.

test("phone normalization matches the server rules", () => {
  expect(normalizePhone("600 111 222")).toBe("+48600111222");
  expect(normalizePhone("0048600111222")).toBe("+48600111222");
  expect(normalizePhone("+380 67 123 45 67")).toBe("+380671234567");
  expect(normalizePhone("")).toBeNull();
  for (const bad of ["1234", "060011122", "+48 1234", "abc", "+1234"]) {
    expect(normalizePhone(bad)).toBeUndefined();
  }
});

async function openForm(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  await expect(page.getByRole("heading", { name: SERVICE.name })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(formatTime(SLOT_A.start_at, "pl")) }).click();
  await page.getByPlaceholder(t.namePlaceholder).fill("Иван");
}

test("a bogus phone blocks the booking", async ({ page }) => {
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A]);
  await mockCreateBooking(page, () => ({ status: 201, body: bookingResponse("pending") }));
  await openForm(page);

  await page.getByPlaceholder(t.phonePlaceholder).fill("1234");
  await expect(page.getByText(t.phoneInvalid)).toBeVisible();
  await expect(page.getByRole("button", { name: t.submitBooking })).toBeDisabled();

  await page.getByPlaceholder(t.phonePlaceholder).fill("600 111 222");
  await expect(page.getByText(t.phoneInvalid)).toHaveCount(0);
  await expect(page.getByRole("button", { name: t.submitBooking })).toBeEnabled();
});

test("the client can hide the number from the master; the master's phone shows after booking", async ({ page }) => {
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A]);
  let sent: Record<string, unknown> = {};
  await page.route("**/api/bookings", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...bookingResponse("pending"), provider_phone: "+48600999888" }),
    });
  });
  await openForm(page);

  await page.getByPlaceholder(t.phonePlaceholder).fill("600 111 222");
  await page.getByLabel(t.clientPhoneVisibleLabel).uncheck();
  await page.getByRole("button", { name: t.submitBooking }).click();

  await expect(page.getByText(t.bookingCreatedTitle)).toBeVisible();
  expect(sent.client_phone).toBe("+48600111222");
  expect(sent.client_phone_visible).toBe(false);
  await expect(page.getByRole("link", { name: "+48600999888" })).toHaveAttribute("href", "tel:+48600999888");
});

test("the city can be changed from the slot step", async ({ page }) => {
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A]);
  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  await expect(page.getByRole("heading", { name: SERVICE.name })).toBeVisible();

  await page.getByRole("button", { name: t.cityChange }).click();
  await expect(page.getByText(t.cityPickTitle)).toBeVisible();
});

test("the master saves the phone and when clients see it", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyCalendar(page, {});
  let put: Record<string, unknown> = {};
  await page.route("**/api/providers/me/phone", async (route) => {
    put = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ phone: "+48600111333", phone_visibility: put.phone_visibility }),
    });
  });

  await page.goto("/cabinet/");
  await openTab(page, t.settingsTitle);
  const input = page.getByPlaceholder(t.myPhonePlaceholder);
  await input.fill("1234");
  await page.getByRole("button", { name: t.myPhoneSave }).click();
  await expect(page.getByText(t.phoneInvalid)).toBeVisible();

  await input.fill("600 111 333");
  await page.getByLabel(t.myPhoneVisAfterBooking).check();
  await page.getByRole("button", { name: t.myPhoneSave }).click();
  await expect(page.getByText(t.myPhoneSaved)).toBeVisible();
  expect(put).toEqual({ phone: "600 111 333", phone_visibility: "after_booking" });
  await expect(input).toHaveValue("+48600111333");
});
