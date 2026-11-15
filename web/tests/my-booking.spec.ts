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

test("the home card lets the client change or cancel while there is time", async ({ page }) => {
  await mockCatalog(page);
  await mockMyBooking(page, { status: "confirmed", can_change: true });
  let cancelled = false;
  await page.route(`**/api/my-booking/${ID}/cancel**`, (route) => {
    cancelled = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: ID, status: "cancelled" }),
    });
  });
  await page.goto(`/booking/?id=${ID}&token=secret`);
  await expect(page.getByText(SERVICE.name).first()).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: t.myBookingRescheduleButton })).toHaveAttribute(
    "href",
    `/booking/?id=${ID}&token=secret&do=reschedule`,
  );
  await page.getByRole("button", { name: t.myBookingCancelButton }).click();
  await page.getByRole("button", { name: t.homeCancelSure }).click();
  await expect.poll(() => cancelled).toBe(true);
});

test("«change time» from the home card opens the free-slot picker", async ({ page }) => {
  await mockMyBooking(page, { status: "confirmed", can_change: true });
  await page.route(`**/api/my-booking/${ID}/slots**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto(`/booking/?id=${ID}&token=secret&do=reschedule`);
  await expect(page.getByText(t.myBookingPickNewTime)).toBeVisible();
});

test("other bookings of the same phone are found through a live link", async ({ page }) => {
  const OTHER = "0b0d6f0e-5a52-4c4b-9a52-2f1d7c1a9e11";
  await mockCatalog(page);
  await mockMyBooking(page, { status: "cancelled" });
  await page.route(`**/api/my-booking/${ID}/history**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: OTHER, service_name: SERVICE.name, provider_name: PROVIDER.name,
          start_at: "2027-06-09T09:00:00+02:00", status: "pending", price: null, manage_token: "tok2" },
        { id: ID, service_name: SERVICE.name, provider_name: PROVIDER.name,
          start_at: "2027-06-07T09:00:00+02:00", status: "cancelled", price: null, manage_token: "secret" },
      ]),
    }),
  );
  await page.route(`**/api/my-booking/${OTHER}?**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: OTHER, service_name: SERVICE.name, provider_name: PROVIDER.name,
        start_at: "2027-06-09T09:00:00+02:00", end_at: "2027-06-09T10:00:00+02:00",
        status: "pending", can_change: false, change_deadline: "2027-06-09T07:00:00+02:00", location: null,
      }),
    }),
  );
  await page.goto(`/booking/?id=${ID}&token=secret`);
  await expect(page.getByRole("link", { name: t.bookAgain })).toBeVisible();

  await page.goto("/");
  const card = page.getByRole("link", { name: new RegExp(t.homeWhereIsMaster.replace("?", "\?")) });
  await expect(card).toHaveAttribute("href", `/booking/?id=${OTHER}&token=tok2`);
});

test("the booking page has a way back to the home page", async ({ page }) => {
  await mockMyBooking(page, { status: "confirmed" });
  await page.goto(`/booking/?id=${ID}&token=secret`);
  await expect(page.getByRole("link", { name: t.backToBooking })).toHaveAttribute("href", "/");
});

test("the master's map opens full screen and closes again", async ({ page }) => {
  await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
  await mockMyBooking(page, {
    status: "confirmed",
    location: { lat: 54.52, lng: 18.53, updated_at: new Date().toISOString() },
  });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  const map = page.getByTestId("provider-map");
  await expect(map).toBeVisible();
  expect((await map.boundingBox())!.height).toBeLessThan(300);

  await page.getByRole("button", { name: t.mapFullscreen }).click();
  await expect.poll(async () => (await map.boundingBox())!.height).toBe(800);
  // Leaflet's own classes survive the toggle (a React className swap wiped
  // them once and the tiles shrank to 0 px)
  await expect(map).toHaveClass(/leaflet-container/);

  await page.getByRole("button", { name: t.mapExitFullscreen }).click();
  await expect.poll(async () => (await map.boundingBox())!.height).toBeLessThan(300);
});

const iso = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();

test("during the job: no stale travel text, and a note when the master isn't sharing location", async ({ page }) => {
  await mockMyBooking(page, {
    status: "confirmed",
    start_at: iso(-30),
    end_at: iso(15),
    tracking_from: iso(-90),
    travel_minutes: 30,
    provider_phone: "+48600111222",
    location: null,
  });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  await expect(page.getByText(t.myBookingInProgress)).toBeVisible();
  await expect(page.getByText(t.myBookingNoLocation)).toBeVisible();
  await expect(page.getByRole("link", { name: t.myBookingCallMaster })).toHaveAttribute("href", "tel:+48600111222");
  await expect(page.getByText(/ехать около 30/)).toHaveCount(0);
});

test("after the booked time the page says so, without the no-location note", async ({ page }) => {
  await mockMyBooking(page, {
    status: "confirmed",
    start_at: iso(-90),
    end_at: iso(-45),
    tracking_from: iso(-150),
    travel_minutes: 30,
    location: null,
  });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  await expect(page.getByText(t.myBookingTimeOver)).toBeVisible();
  await expect(page.getByText(t.myBookingNoLocation)).toHaveCount(0);
});

test("a completed booking: the client confirms the job right here, then gets «rate the specialist»", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route(`**/api/reviews/invite/${ID}/confirm**`, async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ provider_name: "x", service_name: "y", start_at: iso(-60), client_name: "z", client_confirmation: "confirmed" }),
    });
  });
  await mockMyBooking(page, { status: "completed", review_token: "rv-1", client_confirmation: null, reviewed: false });
  await page.goto(`/booking/?id=${ID}&token=secret`);

  await expect(page.getByRole("heading", { name: t.jobDoneQuestion })).toBeVisible();
  await page.getByRole("button", { name: t.jobDoneConfirm }).click();

  const rate = page.getByRole("link", { name: t.rateMasterButton });
  await expect(rate).toHaveAttribute("href", `/review/?booking_id=${ID}&token=rv-1`);
  expect(sent).toEqual([{ token: "rv-1", ok: true, problem: null }]);
});

test("a completed and reviewed booking just says thank you", async ({ page }) => {
  await mockMyBooking(page, { status: "completed", review_token: null, client_confirmation: "confirmed", reviewed: true });
  await page.goto(`/booking/?id=${ID}&token=secret`);
  await expect(page.getByText(t.reviewThankYou)).toBeVisible();
  await expect(page.getByRole("button", { name: t.jobDoneConfirm })).toHaveCount(0);
});
