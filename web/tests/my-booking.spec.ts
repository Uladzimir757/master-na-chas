import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { mockCatalog, PROVIDER, SERVICE, t } from "./mocks";

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

  // 09:00 start, 30 min drive -> leaves at 08:30
  await expect(page.getByText(t.myBookingTravel(30, "09:00", "08:30"))).toBeVisible();
  await expect(page.getByRole("link", { name: t.bookAgain })).toHaveCount(0);
});

test("before the tracking window the page says when the map will appear", async ({ page }) => {
  await mockMyBooking(page, { status: "confirmed", tracking_from: "2027-06-07T07:00:00+02:00" });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  const hint = page.getByText(/здесь на карте будет видно/);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("07:00");
});

test("a late master shows the honest arrival time", async ({ page }) => {
  // booked 09:00, previous job pushes arrival to 09:15
  await mockMyBooking(page, {
    status: "confirmed",
    travel_minutes: 45,
    expected_arrival_at: "2027-06-07T09:15:00+02:00",
  });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  await expect(page.getByText(t.myBookingTravel(45, "09:15", "08:30"), { exact: false })).toBeVisible();
  await expect(page.getByText(t.myBookingLate(15), { exact: false })).toBeVisible();
});

// «Где мой мастер?» — клиент, ушедший на главную, возвращается к заказу.
test("the home page links back to a booking opened on this device", async ({ page }) => {
  await mockCatalog(page);
  await mockMyBooking(page, { status: "confirmed" });
  await page.goto(`/booking/?id=${ID}&token=secret`);
  await expect(page.getByText(SERVICE.name).first()).toBeVisible();

  await page.goto("/");
  const card = page.getByRole("link", { name: new RegExp(t.homeWhereIsMaster.replace("?", "\?")) });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", `/booking/?id=${ID}&token=secret`);
});

test("a cancelled booking is not offered on the home page", async ({ page }) => {
  await mockCatalog(page);
  await mockMyBooking(page, { status: "cancelled" });
  await page.goto(`/booking/?id=${ID}&token=secret`);
  await expect(page.getByRole("link", { name: t.bookAgain })).toBeVisible();

  const checked = page.waitForResponse((r) => r.url().includes(`/api/my-booking/${ID}?`));
  await page.goto("/");
  await checked;
  await page.waitForTimeout(300); // карточка рисуется после ответа
  await expect(page.getByText(t.homeWhereIsMaster)).toHaveCount(0);
});
