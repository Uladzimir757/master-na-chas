import type { Page } from "@playwright/test";

/** Shared fixture data + route-mocking helpers for the E2E suite. Every
 * spec mocks the backend by request *path* (page.route's "**" glob matches
 * regardless of origin) — none of this depends on what NEXT_PUBLIC_API_URL
 * actually resolved to at build time. */

export const SERVICE = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Стрижка",
  duration_minutes: 60,
  price_min: 100,
  price_max: 150,
};

export const PROVIDER = { id: "22222222-2222-2222-2222-222222222222", name: "Владимир" };

function makeSlot(isoStartUtc: string, durationMinutes = SERVICE.duration_minutes) {
  const start = new Date(isoStartUtc);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { provider_id: PROVIDER.id, start_at: start.toISOString(), end_at: end.toISOString() };
}

// Fixed, far-future instants — deterministic regardless of when the suite
// runs. Specs read the *displayed* label back out of lib/format's own
// formatTime rather than hardcoding a wall-clock string, so they never need
// to hand-compute the Europe/Warsaw-local rendering of these.
export const SLOT_A = makeSlot("2027-06-07T07:00:00Z");
export const SLOT_B = makeSlot("2027-06-07T09:00:00Z");

export async function mockCatalog(page: Page, opts?: { servicesStatus?: number }) {
  await page.route("**/api/services", (route) =>
    route.fulfill({
      status: opts?.servicesStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(opts?.servicesStatus ? { detail: "boom" } : [SERVICE]),
    }),
  );
  await page.route("**/api/providers", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([PROVIDER]) }),
  );
}

export async function mockAvailability(page: Page, slotsOrErrorStatus: Array<typeof SLOT_A> | number) {
  await page.route("**/api/availability**", (route) => {
    if (typeof slotsOrErrorStatus === "number") {
      return route.fulfill({
        status: slotsOrErrorStatus,
        contentType: "application/json",
        body: JSON.stringify({ detail: "boom" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(slotsOrErrorStatus) });
  });
}

export function bookingResponse(status: "pending" | "confirmed", slot: typeof SLOT_A = SLOT_A) {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    provider_id: slot.provider_id,
    service_id: SERVICE.id,
    client_name: "Иван",
    client_phone: null,
    start_at: slot.start_at,
    end_at: slot.end_at,
    status,
  };
}

/** `respond(callIndex)` decides what each successive POST /api/bookings gets
 * back — lets a test make the first attempt conflict (409) and a later one
 * succeed, for example. */
export async function mockCreateBooking(
  page: Page,
  respond: (callIndex: number) => { status: number; body: unknown },
) {
  let calls = 0;
  await page.route("**/api/bookings", (route) => {
    const { status, body } = respond(calls++);
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}
