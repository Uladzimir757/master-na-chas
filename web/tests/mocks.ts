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

// Личный кабинет мастера (/cabinet) — the session-cookie-authenticated
// master-only endpoints. GET /api/providers/me and PATCH
// /api/providers/me/settings are two different paths (not the same route
// with different verbs), same for GET /api/bookings vs. PATCH
// /api/bookings/{id}/status, which is why each gets its own route below
// rather than reusing mockCatalog/mockCreateBooking.

type CabinetBookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

interface CabinetBookingFixture {
  id: string;
  provider_id: string;
  service_id: string;
  client_name: string;
  client_phone: string;
  start_at: string;
  end_at: string;
  status: CabinetBookingStatus;
}

export function cabinetBooking(overrides: Partial<CabinetBookingFixture> = {}): CabinetBookingFixture {
  return { ..._cabinetBookingDefaults(), ...overrides };
}

function _cabinetBookingDefaults(): CabinetBookingFixture {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    provider_id: PROVIDER.id,
    service_id: SERVICE.id,
    client_name: "Иван",
    client_phone: "+48123456789",
    start_at: SLOT_A.start_at,
    end_at: SLOT_A.end_at,
    status: "pending",
  };
}

/** GET /auth/me — whether the session cookie (if any) is still valid. */
export async function mockAuthMe(page: Page, opts: { loggedIn: boolean }) {
  await page.route("**/auth/me", (route) =>
    route.fulfill(
      opts.loggedIn
        ? { status: 200, contentType: "application/json", body: JSON.stringify({ master_user_id: "master-1" }) }
        : { status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Not authenticated" }) },
    ),
  );
}

/** POST /auth/login. Defaults to success; pass a non-200 status to simulate
 * wrong credentials (401) or a server error (500). */
export async function mockLogin(page: Page, opts?: { status?: number }) {
  const status = opts?.status ?? 200;
  await page.route("**/auth/login", (route) =>
    route.fulfill(
      status === 200
        ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }
        : { status, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) },
    ),
  );
}

/** POST /auth/logout — always succeeds, Cabinet.tsx treats it as best-effort
 * anyway. */
export async function mockLogout(page: Page) {
  await page.route("**/auth/logout", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
}

/** GET /api/providers/me (settings) and PATCH /api/providers/me/settings
 * (toggle). The PATCH handler updates the value the GET handler was
 * returning, so a reload-less UI flow (toggle -> re-render) sees the new
 * value, same as the real backend. */
export async function mockProviderSettings(page: Page, opts?: { requiresConfirmation?: boolean; patchStatus?: number }) {
  let current = opts?.requiresConfirmation ?? true;
  const settingsBody = () =>
    JSON.stringify({ id: PROVIDER.id, name: PROVIDER.name, requires_booking_confirmation: current });

  await page.route("**/api/providers/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: settingsBody() }),
  );
  await page.route("**/api/providers/me/settings", (route) => {
    if (opts?.patchStatus && opts.patchStatus !== 200) {
      return route.fulfill({
        status: opts.patchStatus,
        contentType: "application/json",
        body: JSON.stringify({ detail: "boom" }),
      });
    }
    const payload = JSON.parse(route.request().postData() ?? "{}");
    current = payload.requires_booking_confirmation;
    return route.fulfill({ status: 200, contentType: "application/json", body: settingsBody() });
  });
}

/** GET /api/bookings — the master's own bookings list. */
export async function mockMyBookings(page: Page, bookings: unknown[]) {
  await page.route("**/api/bookings", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bookings) });
  });
}

/** PATCH /api/bookings/{id}/status — `respond` gets the booking id and the
 * requested status, and decides what comes back (so a test can simulate the
 * IDOR-fix rejecting another master's booking, or a transient failure). */
export async function mockBookingStatusUpdate(
  page: Page,
  respond: (bookingId: string, status: string) => { status: number; body: unknown },
) {
  await page.route("**/api/bookings/*/status", (route) => {
    const segments = new URL(route.request().url()).pathname.split("/");
    const bookingId = segments[segments.length - 2];
    const payload = JSON.parse(route.request().postData() ?? "{}");
    const { status, body } = respond(bookingId, payload.status);
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}
