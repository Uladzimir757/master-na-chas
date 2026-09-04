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
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error(
          "NEXT_PUBLIC_API_URL is not set. It must be provided as a build-time environment " +
            "variable (e.g. in Render's service settings) — it cannot be set at runtime.",
        );
      })()
    : "http://127.0.0.1:8000");

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

export interface Booking {
  id: string;
  provider_id: string;
  service_id: string;
  client_name: string;
  client_phone: string | null;
  start_at: string;
  end_at: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
}

export const api = {
  listServices: () => request<Service[]>("/api/services"),
  listProviders: () => request<Provider[]>("/api/providers"),
  getAvailability: (params: { service_id: string; date_from: string; date_to: string }) =>
    request<Slot[]>(`/api/availability?${new URLSearchParams(params).toString()}`),
  createBooking: (payload: BookingCreate) =>
    request<Booking>("/api/bookings", { method: "POST", body: JSON.stringify(payload) }),
};
