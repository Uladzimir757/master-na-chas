import { formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import {
  bookingResponse,
  cabinetBooking,
  GDYNIA,
  mockAuthMe,
  mockAvailability,
  mockBookingStatusUpdate,
  mockCatalog,
  mockCreateBooking,
  mockMyBookings,
  mockMyCalendar,
  mockMyServices,
  mockProviderSettings,
  openTab,
  SERVICE,
  serviceToggle,
  SLOT_A,
  SOPOT,
  t,
} from "./mocks";

// docs/confirm-timer-travel-cities-task.md: города на главной, таймер
// подтверждения, время доезда при подтверждении.

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

test.describe("city step on the home page", () => {
  test("with several cities the client picks one first and it is remembered", async ({ page }) => {
    await mockCatalog(page, { cities: [GDYNIA, SOPOT] });
    const asked: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.pathname.endsWith("/api/providers")) asked.push(url.searchParams.get("city") ?? "");
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: t.cityPickTitle })).toBeVisible();
    await page.getByRole("button", { name: "Sopot" }).click();

    await expect(page.getByText(t.cityCurrent("Sopot"))).toBeVisible();
    await expect.poll(() => asked).toContain("sopot");

    await page.reload();
    await expect(page.getByText(t.cityCurrent("Sopot"))).toBeVisible();
    await expect(page.getByRole("heading", { name: t.cityPickTitle })).not.toBeVisible();

    await page.getByRole("button", { name: t.cityChange }).click();
    await expect(page.getByRole("heading", { name: t.cityPickTitle })).toBeVisible();
  });

  test("a single city needs no choosing, and the booking carries it", async ({ page }) => {
    await mockCatalog(page);
    await mockAvailability(page, [SLOT_A]);
    let sent: Record<string, unknown> = {};
    await page.route("**/api/bookings", (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ...bookingResponse("pending"), confirm_deadline_at: inMinutes(15) }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: t.chooseMasterButton }).click();
    await expect(page.getByRole("heading", { name: SERVICE.name })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(formatTime(SLOT_A.start_at, "pl")) }).click();
    await page.getByPlaceholder(t.namePlaceholder).fill("Иван");
    await page.getByRole("button", { name: t.submitBooking }).click();

    await expect(page.getByText(t.bookingConfirmWithin(15))).toBeVisible();
    expect(sent.city_id).toBe(GDYNIA.id);
  });

  test("a booking made off-hours says when the master will confirm", async ({ page }) => {
    await mockCatalog(page);
    await mockAvailability(page, [SLOT_A]);
    const deadline = inMinutes(10 * 60 + 15); // timer starts in 10 h
    await mockCreateBooking(page, () => ({
      status: 201,
      body: { ...bookingResponse("pending"), confirm_deadline_at: deadline },
    }));

    await page.goto("/");
    await page.getByRole("button", { name: t.chooseMasterButton }).click();
    await page.getByRole("button", { name: new RegExp(formatTime(SLOT_A.start_at, "pl")) }).click();
    await page.getByPlaceholder(t.namePlaceholder).fill("Иван");
    await page.getByRole("button", { name: t.submitBooking }).click();

    const starts = new Date(new Date(deadline).getTime() - 15 * 60_000).toISOString();
    await expect(page.getByText(t.bookingConfirmAfter(formatTime(starts, "pl")))).toBeVisible();
  });
});

test.describe("cabinet: confirmation timer and travel time", () => {
  async function cabinet(page: import("@playwright/test").Page, booking: ReturnType<typeof cabinetBooking>) {
    await mockAuthMe(page, { loggedIn: true });
    await mockMyServices(page, [serviceToggle()]);
    await mockProviderSettings(page);
    await mockMyCalendar(page, { bookings: [booking] });
  }

  test("a pending booking shows the time left to confirm", async ({ page }) => {
    const booking = cabinetBooking({ status: "pending", confirm_deadline_at: inMinutes(10) });
    await cabinet(page, booking);

    await page.goto("/cabinet/");
    await page.getByText(booking.client_name, { exact: false }).click();
    await expect(page.getByRole("timer")).toContainText(t.confirmCountdown("").trim());
  });

  test("confirming after the deadline explains why it failed", async ({ page }) => {
    const booking = cabinetBooking({ status: "pending", confirm_deadline_at: inMinutes(1) });
    await cabinet(page, booking);
    await mockBookingStatusUpdate(page, () => ({ status: 409, body: { detail: "Confirmation deadline has passed" } }));

    await page.goto("/cabinet/");
    await page.getByText(booking.client_name, { exact: false }).click();
    await page.getByRole("button", { name: t.confirmBookingButton }).click();
    await page.getByRole("button", { name: t.travelMinutesChip(15), exact: true }).click();
    await expect(page.getByText(t.confirmDeadlinePassedError)).toBeVisible();
  });

  test("a confirmed booking shows travel time and when to leave", async ({ page }) => {
    const booking = cabinetBooking({ status: "confirmed", travel_minutes: 30 });
    await cabinet(page, booking);

    await page.goto("/cabinet/");
    await page.getByText(booking.client_name, { exact: false }).click();
    await expect(page.getByText(t.travelInfo(30, "08:30"))).toBeVisible();
  });

  test("a push deep link opens that booking's details", async ({ page }) => {
    const booking = cabinetBooking({ status: "pending", confirm_deadline_at: inMinutes(12) });
    await cabinet(page, booking);
    await mockMyBookings(page, [booking]);

    await page.goto(`/cabinet/?booking=${booking.id}`);
    await expect(page.getByRole("button", { name: t.confirmBookingButton })).toBeVisible();
    await expect(page).toHaveURL(/\/cabinet\/$/);
  });
});

test.describe("cabinet: my cities", () => {
  test("the master saves his cities with an explicit button, at least one", async ({ page }) => {
    await mockAuthMe(page, { loggedIn: true });
    await mockMyServices(page, [serviceToggle()]);
    await mockProviderSettings(page);
    await mockMyCalendar(page, {});
    await page.route("**/api/providers/me/working-hours**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ template: [], exceptions: [] }) }),
    );
    let saved: unknown = null;
    let selected = new Set([GDYNIA.id]);
    await page.route("**/api/providers/me/cities", (route) => {
      if (route.request().method() === "PUT") {
        saved = JSON.parse(route.request().postData() ?? "{}").city_ids;
        selected = new Set(saved as string[]);
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([GDYNIA, SOPOT].map((c) => ({ ...c, selected: selected.has(c.id) }))),
      });
    });

    await page.goto("/cabinet/");
    await openTab(page, t.settingsTitle);
    await expect(page.getByText(t.myCitiesTitle)).toBeVisible();

    await page.getByRole("checkbox", { name: "Gdynia" }).uncheck();
    expect(saved).toBeNull(); // nothing saved by just ticking
    await page.getByRole("button", { name: t.myCitiesSave }).click();
    await expect(page.getByText(t.myCitiesMinOne)).toBeVisible();
    expect(saved).toBeNull();

    await page.getByRole("checkbox", { name: "Sopot" }).check();
    await page.getByRole("button", { name: t.myCitiesSave }).click();
    await expect(page.getByText(t.myCitiesSaved)).toBeVisible();
    expect(saved).toEqual([SOPOT.id]);
  });
});
