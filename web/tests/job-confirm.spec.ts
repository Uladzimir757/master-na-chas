import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { mockCatalog, t } from "./mocks";

// Client after the master marked the job done (app/review/page.tsx):
// «Was the job done?» first — confirm or report a problem — then the rating.
// And «Already booked?» on the home page (components/FindMyBookings.tsx).

const BOOKING_ID = "99999999-9999-9999-9999-999999999999";
const INVITE = {
  provider_name: "Владимир",
  service_name: "Ремонт крана",
  start_at: "2026-11-16T09:00:00+01:00",
  client_name: "Иван",
  client_confirmation: null as "confirmed" | "problem" | null,
};

async function mockInvite(page: Page, sent: unknown[]) {
  await page.route(`**/api/reviews/invite/${BOOKING_ID}/confirm**`, async (route) => {
    const body = route.request().postDataJSON() as { ok: boolean };
    sent.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...INVITE, client_confirmation: body.ok ? "confirmed" : "problem" }),
    });
  });
  await page.route(`**/api/reviews/invite/${BOOKING_ID}?**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(INVITE) }),
  );
}

test("client confirms the job, then gets the rating form", async ({ page }) => {
  const sent: unknown[] = [];
  await mockInvite(page, sent);
  await page.goto(`/review/?booking_id=${BOOKING_ID}&token=tok`);

  await expect(page.getByRole("heading", { name: t.jobDoneQuestion })).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await page.getByRole("button", { name: t.jobDoneConfirm }).click();

  await expect(page.getByRole("radiogroup")).toBeVisible();
  expect(sent).toEqual([{ token: "tok", ok: true, problem: null }]);
});

test("client reports a problem with their words", async ({ page }) => {
  const sent: unknown[] = [];
  await mockInvite(page, sent);
  await page.goto(`/review/?booking_id=${BOOKING_ID}&token=tok`);

  await page.getByRole("button", { name: t.jobDoneProblem }).click();
  await page.getByPlaceholder(t.jobProblemPlaceholder).fill("Кран всё ещё течёт");
  await page.getByRole("button", { name: t.jobProblemSend }).click();

  await expect(page.getByRole("status")).toHaveText(t.jobProblemSent);
  expect(sent).toEqual([{ token: "tok", ok: false, problem: "Кран всё ещё течёт" }]);
});

test("already answered goes straight to the rating", async ({ page }) => {
  await page.route(`**/api/reviews/invite/${BOOKING_ID}?**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...INVITE, client_confirmation: "confirmed" }),
    }),
  );
  await page.goto(`/review/?booking_id=${BOOKING_ID}&token=tok`);
  await expect(page.getByRole("radiogroup")).toBeVisible();
  await expect(page.getByRole("heading", { name: t.jobDoneQuestion })).toHaveCount(0);
});

test("home: phone number gets the bookings link by SMS, nothing on screen", async ({ page }) => {
  await mockCatalog(page);
  const phones: string[] = [];
  await page.route("**/api/my-bookings/link", async (route) => {
    phones.push((route.request().postDataJSON() as { phone: string }).phone);
    await route.fulfill({ status: 202, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto("/");

  const box = page.getByRole("region", { name: t.findBookingsTitle });
  await box.getByPlaceholder(t.findBookingsPhonePlaceholder).fill("1234");
  await expect(box.getByRole("button", { name: t.findBookingsButton })).toBeDisabled();
  await box.getByPlaceholder(t.findBookingsPhonePlaceholder).fill("600 111 222");
  await box.getByRole("button", { name: t.findBookingsButton }).click();

  await expect(box.getByRole("status")).toHaveText(t.findBookingsSent);
  expect(phones).toEqual(["600 111 222"]);
});
