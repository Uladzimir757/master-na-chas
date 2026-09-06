import type { Page } from "@playwright/test";
import { buildTranslations } from "../lib/i18n";

/** Shared fixture data + route-mocking helpers for the E2E suite. Every
 * spec mocks the backend by request *path* (page.route's "**" glob matches
 * regardless of origin) — none of this depends on what NEXT_PUBLIC_API_URL
 * actually resolved to at build time. */

// Этап 3 — every spec's page loads now fetch GET /api/translations before
// rendering any copy (see lib/LocaleContext.tsx). tests/fixtures.ts mocks
// this route for every test automatically using this exact fixture, so
// specs can keep asserting against `t.xxx` (imported from here, not from
// lib/i18n.ts directly — there's no static dictionary there any more).
// Content matches the real ru seed data (scripts/seed_translations.py) —
// unrelated to whichever `lang` a test's page actually resolves to; the
// mock ignores the query param and always serves this one map, which is
// deliberately fine since a spec never asserts on which *language* is
// showing, only that some fixed, known text is.
export const TRANSLATIONS_FIXTURE: Record<string, string> = {
  loading: "Загрузка…",
  catalogLoadError: "Не удалось загрузить услуги. Проверьте связь и обновите страницу.",
  pickServiceTitle: "Выберите услугу",
  changeService: "← сменить услугу",
  durationMinutes: "{n} мин",
  slotsLoading: "Загрузка слотов…",
  slotsLoadError: "Не удалось загрузить свободные слоты.",
  noSlotsInRange: "На ближайшие {days} дней свободных слотов нет.",
  namePlaceholder: "Ваше имя",
  phonePlaceholder: "Телефон (для SMS о записи)",
  submitBooking: "Подтвердить запись",
  submitting: "Отправка…",
  slotTakenError: "Это время только что заняли. Выберите другой слот.",
  genericSubmitError: "Не удалось создать запись. Попробуйте ещё раз.",
  bookingCreatedTitle: "Запись создана",
  bookingPending: "Мастер подтвердит запись в ближайшее время.",
  bookingConfirmed: "Запись подтверждена.",
  bookAgain: "Записаться ещё раз",
  today: "Сегодня",
  tomorrow: "Завтра",
  priceFrom: "от {v} zł",
  priceRange: "{min}–{max} zł",
  callOutFeeLine: "+ выезд {fee} zł",
  pageTitle: "Мастер на час — запись",
  pageDescription: "Онлайн-запись на услуги мастера — слоты в реальном времени",
  defaultMasterName: "мастер",
  cabinetLink: "Кабинет мастера",
  cabinetLoading: "Загрузка кабинета…",
  cabinetLoginTitle: "Вход для мастера",
  emailPlaceholder: "Email",
  passwordPlaceholder: "Пароль",
  showPassword: "Показать пароль",
  hidePassword: "Скрыть пароль",
  loginButton: "Войти",
  loggingIn: "Вход…",
  loginError: "Неверный email или пароль.",
  loginGenericError: "Не удалось войти. Проверьте связь и попробуйте ещё раз.",
  logoutButton: "Выйти",
  backToBooking: "← на страницу записи",
  cabinetTitle: "Кабинет — {name}",
  cabinetLoadError: "Не удалось загрузить данные кабинета. Обновите страницу.",
  settingsTitle: "Настройки",
  requiresConfirmationLabel: "Подтверждать брони вручную",
  requiresConfirmationHint:
    "Включено — новая запись сначала ждёт вашего подтверждения. Выключено — подтверждается сразу при создании.",
  settingsSaveError: "Не удалось сохранить настройку. Попробуйте ещё раз.",
  callOutFeeLabel: "Плата за выезд (zł)",
  callOutFeeHint: "Отдельная строка поверх цены услуги на странице записи. Оставьте пустым, если не берёте отдельно.",
  callOutFeePlaceholder: "Не задано",
  servicesOfferedTitle: "Мои услуги",
  servicesOfferedHint: "Отметьте, какие услуги вы оказываете — они появятся у клиентов на странице записи.",
  noActiveServices: "В каталоге пока нет активных услуг.",
  servicesSaveError: "Не удалось сохранить список услуг. Попробуйте ещё раз.",
  bookingsTitle: "Брони",
  noBookings: "Броней пока нет.",
  "bookingStatus.pending": "Ждёт подтверждения",
  "bookingStatus.confirmed": "Подтверждено",
  "bookingStatus.completed": "Завершено",
  "bookingStatus.cancelled": "Отменено",
  "bookingStatus.no_show": "Клиент не пришёл",
  confirmBookingButton: "Подтвердить",
  cancelBookingButton: "Отменить",
  bookingActionError: "Не удалось изменить статус брони. Попробуйте ещё раз.",
  shareLocationLabel: "Показывать клиентам моё местоположение",
  shareLocationHint:
    "Точка на карте видна клиентам, только пока эта страница открыта у вас в браузере и сейчас ваши рабочие часы.",
  locationSharingActive: "Местоположение транслируется",
  locationSharingWaiting: "Определяем ваше местоположение…",
  locationSharingDenied: "Нет доступа к геолокации — разрешите её в настройках браузера.",
  locationSharingUnsupported: "Этот браузер не поддерживает геолокацию.",
  locationSharingError: "Не удалось определить местоположение.",
  masterLocationTitle: "Мастер сейчас здесь",
  masterLocationJustNow: "Только что",
  masterLocationMinutesAgo: "{n} мин назад",
  busyTitle: "Занят сейчас",
  busyHint:
    "Отметьте это, когда начинаете работу — часы в календаре закроются для новых записей, пока вы не нажмёте «Закончить».",
  startBusyButton: "Начать",
  finishBusyButton: "Закончить",
  busyStatusSince: "Вы заняты с {time}",
  busyUntilText: "Ориентировочно освободитесь в {time}",
  busyOpenEndedNote: "Без оценки времени часы останутся закрытыми, пока вы не нажмёте «Закончить».",
  busyEstimateLabel: "Предположительное время работы (мин.)",
  busyEstimateHint: "Укажите — и через это время плюс 30 минут часы снова откроются для записи.",
  busyEstimatePlaceholder: "например, 60",
  busyActionError: "Не удалось обновить статус. Попробуйте ещё раз.",
};

export const t = buildTranslations(TRANSLATIONS_FIXTURE);

/** Explicit variant for a spec that wants to control the translations mock
 * itself (a custom/partial map, or a specific status code) instead of
 * relying on tests/fixtures.ts's automatic one. */
export async function mockTranslations(page: Page, map: Record<string, string> = TRANSLATIONS_FIXTURE) {
  await page.route("**/api/translations**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(map) }),
  );
}

export const SERVICE = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Стрижка",
  duration_minutes: 60,
  price_min: 100,
  price_max: 150,
};

export interface ProviderLocationFixture {
  lat: number;
  lng: number;
  updated_at: string;
}

export const PROVIDER = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Владимир",
  call_out_fee: null as number | null,
  location: null as ProviderLocationFixture | null,
};

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

export async function mockCatalog(page: Page, opts?: { servicesStatus?: number; providers?: (typeof PROVIDER)[] }) {
  // "**" at the end, not just "**/api/services": listServices() now appends
  // ?lang= (Этап 3, lib/api.ts) — a query string after the path fails to
  // match a pattern with no trailing wildcard, same reason mockAvailability
  // below already needs one.
  await page.route("**/api/services**", (route) =>
    route.fulfill({
      status: opts?.servicesStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(opts?.servicesStatus ? { detail: "boom" } : [SERVICE]),
    }),
  );
  await page.route("**/api/providers", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts?.providers ?? [PROVIDER]) }),
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
 * (toggle + call-out fee). The PATCH handler updates the values the GET
 * handler was returning, so a reload-less UI flow (toggle/blur -> re-render)
 * sees the new value, same as the real backend. */
export async function mockProviderSettings(
  page: Page,
  opts?: {
    requiresConfirmation?: boolean;
    callOutFee?: number | null;
    shareLocation?: boolean;
    patchStatus?: number;
    // "Занят сейчас" initial state + the status the three busy/* endpoints
    // below should answer with (defaults to success, same as patchStatus's
    // default above).
    busyStartedAt?: string | null;
    busyEstimatedMinutes?: number | null;
    busyUntil?: string | null;
    busyActionStatus?: number;
  },
) {
  let currentConfirmation = opts?.requiresConfirmation ?? true;
  let currentFee = opts?.callOutFee ?? null;
  let currentShareLocation = opts?.shareLocation ?? false;
  let busyStartedAt = opts?.busyStartedAt ?? null;
  let busyEstimatedMinutes = opts?.busyEstimatedMinutes ?? null;
  let busyUntil = opts?.busyUntil ?? null;

  const settingsBody = () =>
    JSON.stringify({
      id: PROVIDER.id,
      name: PROVIDER.name,
      requires_booking_confirmation: currentConfirmation,
      call_out_fee: currentFee,
      share_location: currentShareLocation,
      busy_started_at: busyStartedAt,
      busy_estimated_minutes: busyEstimatedMinutes,
      busy_until: busyUntil,
    });

  const busyBody = () =>
    JSON.stringify({
      busy_started_at: busyStartedAt,
      busy_estimated_minutes: busyEstimatedMinutes,
      busy_until: busyUntil,
    });

  const busyActionFailure = () =>
    opts?.busyActionStatus && opts.busyActionStatus !== 200
      ? { status: opts.busyActionStatus, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) }
      : null;

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
    currentConfirmation = payload.requires_booking_confirmation;
    currentFee = payload.call_out_fee;
    currentShareLocation = payload.share_location;
    return route.fulfill({ status: 200, contentType: "application/json", body: settingsBody() });
  });

  // Fixed instant regardless of when the suite runs — specs read the
  // *displayed* label back out of lib/format's own formatTime rather than
  // hardcoding a wall-clock string, same convention as SLOT_A/SLOT_B above.
  await page.route("**/api/providers/me/busy/start", (route) => {
    const failure = busyActionFailure();
    if (failure) return route.fulfill(failure);
    busyStartedAt = "2027-06-07T10:00:00Z";
    busyEstimatedMinutes = null;
    busyUntil = null;
    return route.fulfill({ status: 200, contentType: "application/json", body: busyBody() });
  });
  await page.route("**/api/providers/me/busy/finish", (route) => {
    const failure = busyActionFailure();
    if (failure) return route.fulfill(failure);
    busyStartedAt = null;
    busyEstimatedMinutes = null;
    busyUntil = null;
    return route.fulfill({ status: 200, contentType: "application/json", body: busyBody() });
  });
  await page.route("**/api/providers/me/busy", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const failure = busyActionFailure();
    if (failure) return route.fulfill(failure);
    const payload = JSON.parse(route.request().postData() ?? "{}");
    busyEstimatedMinutes = payload.estimated_minutes;
    busyUntil =
      busyEstimatedMinutes != null && busyStartedAt != null
        ? new Date(new Date(busyStartedAt).getTime() + (busyEstimatedMinutes + 30) * 60_000).toISOString()
        : null;
    return route.fulfill({ status: 200, contentType: "application/json", body: busyBody() });
  });
}

/** PUT /api/providers/me/location — the cabinet's foreground geolocation
 * ping (lib/useLocationSharing.ts). Only needed by specs that actually grant
 * the browser geolocation permission; every other cabinet spec never
 * triggers it at all (share_location defaults to false). */
export async function mockUpdateMyLocation(page: Page) {
  await page.route("**/api/providers/me/location", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
}

interface ServiceToggleFixture {
  service_id: string;
  name: string;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  is_offered: boolean;
}

export function serviceToggle(overrides: Partial<ServiceToggleFixture> = {}): ServiceToggleFixture {
  return {
    service_id: SERVICE.id,
    name: SERVICE.name,
    duration_minutes: SERVICE.duration_minutes,
    price_min: SERVICE.price_min,
    price_max: SERVICE.price_max,
    is_offered: true,
    ...overrides,
  };
}

/** GET /api/providers/me/services (checklist) and PUT (save). PUT applies
 * replace semantics like the real backend: is_offered flips to true for
 * every id in the posted service_ids, false for every other row. */
export async function mockMyServices(page: Page, initial: ServiceToggleFixture[], opts?: { putStatus?: number }) {
  let current = initial;
  // Trailing "**": both getMyServices and updateMyServices now append
  // ?lang= (Этап 3, lib/api.ts) — see mockCatalog's own note above.
  await page.route("**/api/providers/me/services**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
    }
    // PUT
    if (opts?.putStatus && opts.putStatus !== 200) {
      return route.fulfill({
        status: opts.putStatus,
        contentType: "application/json",
        body: JSON.stringify({ detail: "boom" }),
      });
    }
    const payload = JSON.parse(route.request().postData() ?? "{}");
    const desired = new Set<string>(payload.service_ids ?? []);
    current = current.map((s) => ({ ...s, is_offered: desired.has(s.service_id) }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
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

// ----------------------------------------------------------------------------
// Admin panel (/admin) — separate session flag from the master cabinet above
// (see app/main.py's require_admin: X-Admin-Secret header OR
// session["is_admin"]).
// ----------------------------------------------------------------------------

interface AdminMasterFixture {
  master_user_id: string;
  provider_id: string;
  name: string;
  email: string;
  travel_buffer_minutes: number;
  is_active: boolean;
  telegram_linked: boolean;
}

export function adminMaster(overrides: Partial<AdminMasterFixture> = {}): AdminMasterFixture {
  return {
    master_user_id: "55555555-5555-5555-5555-555555555555",
    provider_id: PROVIDER.id,
    name: PROVIDER.name,
    email: "vladimir@example.com",
    travel_buffer_minutes: 30,
    is_active: true,
    telegram_linked: false,
    ...overrides,
  };
}

/** GET /admin/me — whether the admin session cookie (if any) is still
 * valid. Mirrors mockAuthMe's shape for the master session. */
export async function mockAdminMe(page: Page, opts: { isAdmin: boolean }) {
  await page.route("**/admin/me", (route) =>
    route.fulfill(
      opts.isAdmin
        ? { status: 200, contentType: "application/json", body: JSON.stringify({ is_admin: true }) }
        : { status: 403, contentType: "application/json", body: JSON.stringify({ detail: "Not admin" }) },
    ),
  );
}

/** POST /admin/login. Defaults to success; pass a non-200 status to
 * simulate a wrong password (401) or rate limiting (429). */
export async function mockAdminLogin(page: Page, opts?: { status?: number }) {
  const status = opts?.status ?? 200;
  await page.route("**/admin/login", (route) =>
    route.fulfill(
      status === 200
        ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }
        : { status, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) },
    ),
  );
}

export async function mockAdminLogout(page: Page) {
  await page.route("**/admin/logout", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
}

/** GET /admin/masters (list) and POST /admin/masters (create) — POST
 * appends to the in-memory list the GET handler serves, so the panel's
 * "create then see it in the table" flow works without a page reload,
 * same as the real backend. `createStatus` simulates a duplicate-email
 * (409) or validation (422) failure instead. */
export async function mockAdminMasters(
  page: Page,
  initial: AdminMasterFixture[] = [],
  opts?: { createStatus?: number },
) {
  let current = [...initial];
  await page.route("**/admin/masters", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
    }
    // POST
    if (opts?.createStatus && opts.createStatus !== 200) {
      return route.fulfill({
        status: opts.createStatus,
        contentType: "application/json",
        body: JSON.stringify({ detail: "boom" }),
      });
    }
    const payload = JSON.parse(route.request().postData() ?? "{}");
    const created = adminMaster({
      master_user_id: `created-${current.length + 1}`,
      provider_id: `created-provider-${current.length + 1}`,
      name: payload.name,
      email: payload.email,
      travel_buffer_minutes: payload.travel_buffer_minutes ?? 30,
    });
    current = [...current, created];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ provider_id: created.provider_id, master_user_id: created.master_user_id }),
    });
  });
}

/** POST /admin/masters/{id}/telegram-link. */
export async function mockTelegramLink(page: Page) {
  await page.route("**/admin/masters/*/telegram-link", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        deep_link: "https://t.me/test_bot?start=mock-token",
        token: "mock-token",
        expires_note: "одноразовый — сгорает после первого /start",
      }),
    }),
  );
}
