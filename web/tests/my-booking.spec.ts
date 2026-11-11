import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PROVIDER, SERVICE, t } from "./mocks";

// «Моя запись» (app/booking/page.tsx) — страница клиента по ссылке из SMS.
// Отменённая или прошедшая запись не должна быть тупиком.

const ID = "fa8157c6-aadd-4fc3-b615-dfb0f3186f9d";

async function mockMyBooking(page: Page, overrides: Record<string, unknown>) {
  await page.route(`**/api/my-booking/${ID}/history**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(`**/api/my-booking/${ID}?**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: ID,
        service_name: SERVICE.name,
        provider_name: PROVIDER.name,
        start_at: "2027-06-07T09:00:00+02:00",
        end_at: "2027-06-07T10:00:00+02:00",
        status: "confirmed",
        can_change: false,
        change_deadline: "2027-06-06T09:00:00+02:00",
        location: null,
        ...overrides,
      }),
    }),
  );
}

test("a cancelled booking offers to book again", async ({ page }) => {
  await mockMyBooking(page, { status: "cancelled" });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  const again = page.getByRole("link", { name: t.bookAgain });
  await expect(again).toBeVisible();
  await expect(again).toHaveAttribute("href", "/");
});

test("a booking the master didn't confirm in time points to another master", async ({ page }) => {
  await mockMyBooking(page, { status: "cancelled", cancel_reason: "provider_timeout" });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  await expect(page.getByText(t.myBookingTimedOut)).toBeVisible();
  await expect(page.getByRole("link", { name: t.bookAnotherMaster })).toBeVisible();
});

test("an upcoming booking has no book-again button", async ({ page }) => {
  await mockMyBooking(page, { status: "confirmed", travel_minutes: 30 });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  await expect(page.getByText(t.myBookingTravel(30))).toBeVisible();
  await expect(page.getByRole("link", { name: t.bookAgain })).toHaveCount(0);
});
