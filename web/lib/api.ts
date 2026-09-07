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

// Этап 4 — the public live-location dot. Its mere presence on a Provider IS
// the "show the dot" signal: the backend (app/main.py's
// _resolve_provider_location) only ever includes this once share_location is
// on, the fix is fresh, and it's currently the provider's working hours — a
// client-side check is neither needed nor possible (see
// components/ProviderMap.tsx / SlotPicker.tsx).
export interface ProviderLocation {
  lat: number;
  lng: number;
  updated_at: string; // ISO 8601, tz-aware
}

export interface Provider {
  id: string;
  name: string;
  // Manual stand-in for the not-yet-built reviews system (set from the
  // admin panel) — null means no rating yet. Drives the sort order of
  // components/MasterPicker.tsx (best first, unrated last).
  rating: number | null;
  rating_count: number;
  // Flat "выезд" fee, own line shown once a slot with this provider is
  // picked (see components/SlotPicker.tsx) — null/0 means nothing shown.
  call_out_fee: number | null;
  location: ProviderLocation | null;
}

// One service a specific master offers, with HIS OWN price/description —
// GET /api/providers/{id}/services, used once a master has been picked on
// the home page (components/MasterPicker.tsx -> components/BookingFlow.tsx).
export interface ProviderServiceOffering {
  id: string;
  name: string;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  description: string | null;
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
  share_location: boolean;
  // "Занят сейчас" — read-only here, changed via the busy* endpoints below.
  // See ProviderSettingsOut/ProviderBusyOut in app/schemas.py: busy_until is
  // computed (null means either not busy, or busy with no estimate yet —
  // distinguish using busy_started_at).
  busy_started_at: string | null;
  busy_estimated_minutes: number | null;
  busy_until: string | null;
}

// Response shape shared by all three busy* endpoints below — same fields as
// ProviderSettings' busy_* trio, so callers just spread it over the existing
// settings object rather than re-fetching everything.
export interface ProviderBusy {
  busy_started_at: string | null;
  busy_estimated_minutes: number | null;
  busy_until: string | null;
}

export interface UpdateProviderSettingsPayload {
  requires_booking_confirmation: boolean;
  // Always sent explicitly (never omitted) — the backend replaces the full
  // value each PATCH, so `null` here really does clear a previously-set
  // fee rather than leaving it untouched. See ProviderSettingsUpdate in
  // app/schemas.py.
  call_out_fee: number | null;
  share_location: boolean;
}

// Admin panel (web/app/admin/page.tsx) — superadmin-only master management,
// see app/main.py's "Admin auth" / "Admin — master management" sections.
// Separate session flag (session["is_admin"]) from the master login above;
// a browser could in principle be logged in as both at once, harmless since
// they're read from different session keys.
export interface AdminMaster {
  master_user_id: string;
  provider_id: string;
  name: string;
  email: string;
  travel_buffer_minutes: number;
  is_active: boolean;
  telegram_linked: boolean;
  rating: number | null;
  rating_count: number;
}

export interface CreateMasterPayload {
  name: string;
  email: string;
  password: string;
  travel_buffer_minutes: number;
}

export interface TelegramLink {
  deep_link: string;
  token: string;
  expires_note: string;
}

export interface ServiceToggle {
  service_id: string;
  name: string;
  duration_minutes: number;
  // This provider's own price/description if he's set one, else Service's
  // reference range as a prefill suggestion — see ServiceToggleOut's
  // docstring in app/schemas.py.
  price_min: number | null;
  price_max: number | null;
  description: string | null;
  is_offered: boolean;
}

// PUT body for one entry — "цены приблизительные и должны устанавливаться
// мастером": price is optional (a master can turn a service on without
// pricing it yet), same for the free-text description.
export interface ServiceOffer {
  service_id: string;
  price_min: number | null;
  price_max: number | null;
  description: string | null;
}

export const api = {
  // lang (Этап 3) resolves Service.name server-side — see app/main.py's
  // _resolve_service_name. Not needed by getAvailability: slot times carry
  // no translatable text.
  listServices: (lang: string) => request<Service[]>(`/api/services?lang=${encodeURIComponent(lang)}`),
  // Sorted by rating server-side (see app/main.py's list_providers) — the
  // master-picker screen renders this order as-is, no client-side re-sort.
  listProviders: () => request<Provider[]>("/api/providers"),
  // One master's own offered services, for the booking flow once a master
  // has been picked (components/MasterPicker.tsx).
  listProviderServices: (providerId: string, lang: string) =>
    request<ProviderServiceOffering[]>(`/api/providers/${providerId}/services?lang=${encodeURIComponent(lang)}`),
  getAvailability: (params: { service_id: string; provider_id?: string; date_from: string; date_to: string }) =>
    request<Slot[]>(
      `/api/availability?${new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>,
      ).toString()}`,
    ),
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
  // A logged-in master changing their own password — previously only the
  // superadmin could ever set one, at creation time (see AdminMaster's
  // createMaster below). 401 means the current password was wrong, 422
  // means the new one is too short — see ChangePasswordRequest in
  // app/schemas.py.
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  getMySettings: () => request<ProviderSettings>("/api/providers/me"),
  updateMySettings: (payload: UpdateProviderSettingsPayload) =>
    request<ProviderSettings>("/api/providers/me/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  getMyServices: (lang: string) => request<ServiceToggle[]>(`/api/providers/me/services?lang=${encodeURIComponent(lang)}`),
  // Replace semantics, matching the backend: pass the FULL set of services
  // this provider now offers (each with his own price/description), not a
  // delta — anything not listed here gets turned off.
  updateMyServices: (services: ServiceOffer[], lang: string) =>
    request<ServiceToggle[]>(`/api/providers/me/services?lang=${encodeURIComponent(lang)}`, {
      method: "PUT",
      body: JSON.stringify({ services }),
    }),
  listMyBookings: (statusFilter?: BookingStatus) =>
    request<Booking[]>(`/api/bookings${statusFilter ? `?status=${statusFilter}` : ""}`),
  updateBookingStatus: (bookingId: string, status: BookingStatus) =>
    request<Booking>(`/api/bookings/${bookingId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  // Этап 4 — one fresh GPS fix from lib/useLocationSharing.ts's foreground
  // watch. Fire-and-forget from the caller's point of view: the backend
  // stores it unconditionally (app/main.py's update_my_location), whether
  // or not share_location happens to be on right now.
  updateMyLocation: (lat: number, lng: number) =>
    request<{ ok: true }>("/api/providers/me/location", { method: "PUT", body: JSON.stringify({ lat, lng }) }),

  // "Занят сейчас" — a general override, not tied to any specific booking
  // (see app/main.py's start_busy/update_busy_estimate/finish_busy). start
  // 409s if already busy; the estimate PATCH 409s if not busy yet; finish
  // 409s if not busy. All three return the same ProviderBusy shape.
  startBusy: () => request<ProviderBusy>("/api/providers/me/busy/start", { method: "POST" }),
  // null explicitly clears a previously-set estimate back to open-ended —
  // same always-send-the-full-value shape as updateMySettings.
  updateBusyEstimate: (estimatedMinutes: number | null) =>
    request<ProviderBusy>("/api/providers/me/busy", {
      method: "PATCH",
      body: JSON.stringify({ estimated_minutes: estimatedMinutes }),
    }),
  finishBusy: () => request<ProviderBusy>("/api/providers/me/busy/finish", { method: "POST" }),

  // Admin panel — session cookie set by adminLogin(), same require_admin
  // gate as the pre-existing X-Admin-Secret scripts (app/main.py).
  adminLogin: (password: string) =>
    request<{ ok: true }>("/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  adminLogout: () => request<{ ok: true }>("/admin/logout", { method: "POST" }),
  adminMe: () => request<{ is_admin: true }>("/admin/me"),
  listMasters: () => request<AdminMaster[]>("/admin/masters"),
  createMaster: (payload: CreateMasterPayload) =>
    request<{ provider_id: string; master_user_id: string }>("/admin/masters", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createTelegramLink: (masterUserId: string) =>
    request<TelegramLink>(`/admin/masters/${masterUserId}/telegram-link`, { method: "POST" }),
  // Manual stand-in for the not-yet-built reviews system — see
  // Provider.rating's docstring in app/models.py. null clears it back to
  // "no rating", same always-send-the-full-value shape as everywhere else.
  updateMasterRating: (masterUserId: string, rating: number | null, ratingCount: number) =>
    request<AdminMaster>(`/admin/masters/${masterUserId}`, {
      method: "PATCH",
      body: JSON.stringify({ rating, rating_count: ratingCount }),
    }),
  // 409 when the master has bookings — see app/main.py::delete_master's
  // docstring for why that's checked instead of a raw cascade.
  deleteMaster: (masterUserId: string) =>
    request<{ ok: true }>(`/admin/masters/${masterUserId}`, { method: "DELETE" }),
};
