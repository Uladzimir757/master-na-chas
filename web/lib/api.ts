/**
 * Thin typed wrapper over the FastAPI backend (separate repo/deploy —
 * docs/decisions.md: not merged with Garage System, and this frontend is
 * its own project too). No SDK, no codegen — the API surface is small
 * enough that hand-written types are the right amount of ceremony.
 */

// NEXT_PUBLIC_* is inlined at BUILD time, not read at runtime — a missing
// value here means every deployed visitor silently gets a dead API target
// with no error anywhere obvious to a developer. Falling back to the local
// dev backend is fine for `next dev`/`next build` run by hand without a
// .env.local (NODE_ENV is "development" then); a production build (Render,
// or anyone running `next build` directly) must fail loudly instead of
// shipping that fallback to real visitors.
//
// "localhost", not "127.0.0.1" — uvicorn's default dev bind (127.0.0.1) still
// accepts connections addressed as "localhost" (it resolves to the same
// loopback interface), but the *string* matters for the browser's own-cabinet
// login cookie: the frontend dev server is http://localhost:3000, and a
// cookie is only sent back on same-site fetches. "localhost" and "127.0.0.1"
// are different hostnames as far as that check is concerned, so mixing them
// would silently break local login even though every request still connects
// fine. See app/config.py's SESSION_COOKIE_SAME_SITE for the production side
// of this (a real cross-origin case, unlike local dev).
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error(
          "NEXT_PUBLIC_API_URL is not set. It must be provided as a build-time environment " +
            "variable (e.g. in Render's service settings) — it cannot be set at runtime.",
        );
      })()
    : "http://localhost:8000");

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // The public booking flow never needed this (no login involved), but the
    // master cabinet's session cookie won't be sent OR stored without it —
    // fetch() defaults to "same-origin", and the API is a different origin
    // from the frontend in both prod (separate onrender.com services) and
    // local dev (different port). Harmless for the anonymous endpoints.
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail;
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
}

export interface Provider {
  id: string;
  name: string;
  // Flat "выезд" fee, own line shown once a slot with this provider is
  // picked (see components/SlotPicker.tsx) — null/0 means nothing shown.
  call_out_fee: number | null;
}

export interface Slot {
  provider_id: string;
  start_at: string; // ISO 8601, tz-aware
  end_at: string;
}

export interface BookingCreate {
  service_id: string;
  provider_id: string;
  start_at: string;
  client_name: string;
  client_phone?: string;
  notes?: string;
}

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface Booking {
  id: string;
  provider_id: string;
  service_id: string;
  client_name: string;
  client_phone: string | null;
  start_at: string;
  end_at: string;
  status: BookingStatus;
}

export interface ProviderSettings {
  id: string;
  name: string;
  requires_booking_confirmation: boolean;
  call_out_fee: number | null;
}

export interface UpdateProviderSettingsPayload {
  requires_booking_confirmation: boolean;
  // Always sent explicitly (never omitted) — the backend replaces the full
  // value each PATCH, so `null` here really does clear a previously-set
  // fee rather than leaving it untouched. See ProviderSettingsUpdate in
  // app/schemas.py.
  call_out_fee: number | null;
}

export interface ServiceToggle {
  service_id: string;
  name: string;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  is_offered: boolean;
}

export const api = {
  // lang (Этап 3) resolves Service.name server-side — see app/main.py's
  // _resolve_service_name. Not needed by getAvailability: slot times carry
  // no translatable text.
  listServices: (lang: string) => request<Service[]>(`/api/services?lang=${encodeURIComponent(lang)}`),
  listProviders: () => request<Provider[]>("/api/providers"),
  getAvailability: (params: { service_id: string; date_from: string; date_to: string }) =>
    request<Slot[]>(`/api/availability?${new URLSearchParams(params).toString()}`),
  createBooking: (payload: BookingCreate) =>
    request<Booking>("/api/bookings", { method: "POST", body: JSON.stringify(payload) }),
  // Этап 3 — approved UI strings for one lang, see lib/LocaleContext.tsx.
  getTranslations: (lang: string) => request<Record<string, string>>(`/api/translations?lang=${encodeURIComponent(lang)}`),

  // Личный кабинет мастера — every call below relies on the session cookie
  // set by login(); the API resolves "which provider" from that cookie, not
  // from anything the client sends (see app/main.py's _get_own_provider —
  // GET /api/bookings used to take an arbitrary provider_id and hand back
  // any client's name/phone, which is exactly the bug this shape avoids).
  login: (email: string, password: string) =>
    request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ master_user_id: string }>("/auth/me"),
  getMySettings: () => request<ProviderSettings>("/api/providers/me"),
  updateMySettings: (payload: UpdateProviderSettingsPayload) =>
    request<ProviderSettings>("/api/providers/me/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  getMyServices: (lang: string) => request<ServiceToggle[]>(`/api/providers/me/services?lang=${encodeURIComponent(lang)}`),
  // Replace semantics, matching the backend: pass the FULL set of service
  // ids this provider now offers, not a delta.
  updateMyServices: (serviceIds: string[], lang: string) =>
    request<ServiceToggle[]>(`/api/providers/me/services?lang=${encodeURIComponent(lang)}`, {
      method: "PUT",
      body: JSON.stringify({ service_ids: serviceIds }),
    }),
  listMyBookings: (statusFilter?: BookingStatus) =>
    request<Booking[]>(`/api/bookings${statusFilter ? `?status=${statusFilter}` : ""}`),
  updateBookingStatus: (bookingId: string, status: BookingStatus) =>
    request<Booking>(`/api/bookings/${bookingId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
