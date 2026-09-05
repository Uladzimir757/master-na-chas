/**
 * Every user-facing string is now served by the backend's translation_entry
 * table (Этап 3, docs/ai-and-reviews.md §1) — this file is just the shape
 * `t` has, and how a raw {key: text} map (from GET /api/translations, see
 * lib/LocaleContext.tsx) turns into that shape. No hardcoded copy lives
 * here any more; the pl/ru/ru seed data lives in
 * scripts/seed_translations.py in the backend repo.
 *
 * A key missing from the fetched map (a lang whose translation hasn't been
 * filled in, or a genuinely new key not seeded yet) falls back to the key
 * name itself — visibly wrong rather than a crash, so a gap is easy to spot
 * without taking the page down.
 */

export type TranslationMap = Record<string, string>;

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function pick(map: TranslationMap, key: string): string {
  return map[key] ?? key;
}

export interface Translations {
  loading: string;
  catalogLoadError: string;
  pickServiceTitle: string;
  changeService: string;
  durationMinutes: (n: number) => string;
  slotsLoading: string;
  slotsLoadError: string;
  noSlotsInRange: (days: number) => string;
  namePlaceholder: string;
  phonePlaceholder: string;
  submitBooking: string;
  submitting: string;
  slotTakenError: string;
  genericSubmitError: string;
  bookingCreatedTitle: string;
  bookingPending: string;
  bookingConfirmed: string;
  bookAgain: string;
  today: string;
  tomorrow: string;
  priceFrom: (v: number) => string;
  priceRange: (min: number, max: number) => string;
  callOutFeeLine: (fee: number) => string;
  pageTitle: string;
  pageDescription: string;
  defaultMasterName: string;

  cabinetLink: string;
  cabinetLoading: string;
  cabinetLoginTitle: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  loginButton: string;
  loggingIn: string;
  loginError: string;
  loginGenericError: string;
  logoutButton: string;
  backToBooking: string;
  cabinetTitle: (providerName: string) => string;
  cabinetLoadError: string;
  settingsTitle: string;
  requiresConfirmationLabel: string;
  requiresConfirmationHint: string;
  settingsSaveError: string;
  callOutFeeLabel: string;
  callOutFeeHint: string;
  callOutFeePlaceholder: string;
  servicesOfferedTitle: string;
  servicesOfferedHint: string;
  noActiveServices: string;
  servicesSaveError: string;
  bookingsTitle: string;
  noBookings: string;
  bookingStatusLabel: Record<string, string>;
  confirmBookingButton: string;
  cancelBookingButton: string;
  bookingActionError: string;
}

export function buildTranslations(map: TranslationMap): Translations {
  return {
    loading: pick(map, "loading"),
    catalogLoadError: pick(map, "catalogLoadError"),
    pickServiceTitle: pick(map, "pickServiceTitle"),
    changeService: pick(map, "changeService"),
    durationMinutes: (n) => interpolate(pick(map, "durationMinutes"), { n }),
    slotsLoading: pick(map, "slotsLoading"),
    slotsLoadError: pick(map, "slotsLoadError"),
    noSlotsInRange: (days) => interpolate(pick(map, "noSlotsInRange"), { days }),
    namePlaceholder: pick(map, "namePlaceholder"),
    phonePlaceholder: pick(map, "phonePlaceholder"),
    submitBooking: pick(map, "submitBooking"),
    submitting: pick(map, "submitting"),
    slotTakenError: pick(map, "slotTakenError"),
    genericSubmitError: pick(map, "genericSubmitError"),
    bookingCreatedTitle: pick(map, "bookingCreatedTitle"),
    bookingPending: pick(map, "bookingPending"),
    bookingConfirmed: pick(map, "bookingConfirmed"),
    bookAgain: pick(map, "bookAgain"),
    today: pick(map, "today"),
    tomorrow: pick(map, "tomorrow"),
    priceFrom: (v) => interpolate(pick(map, "priceFrom"), { v }),
    priceRange: (min, max) => interpolate(pick(map, "priceRange"), { min, max }),
    callOutFeeLine: (fee) => interpolate(pick(map, "callOutFeeLine"), { fee }),
    pageTitle: pick(map, "pageTitle"),
    pageDescription: pick(map, "pageDescription"),
    defaultMasterName: pick(map, "defaultMasterName"),

    cabinetLink: pick(map, "cabinetLink"),
    cabinetLoading: pick(map, "cabinetLoading"),
    cabinetLoginTitle: pick(map, "cabinetLoginTitle"),
    emailPlaceholder: pick(map, "emailPlaceholder"),
    passwordPlaceholder: pick(map, "passwordPlaceholder"),
    loginButton: pick(map, "loginButton"),
    loggingIn: pick(map, "loggingIn"),
    loginError: pick(map, "loginError"),
    loginGenericError: pick(map, "loginGenericError"),
    logoutButton: pick(map, "logoutButton"),
    backToBooking: pick(map, "backToBooking"),
    cabinetTitle: (providerName) => interpolate(pick(map, "cabinetTitle"), { name: providerName }),
    cabinetLoadError: pick(map, "cabinetLoadError"),
    settingsTitle: pick(map, "settingsTitle"),
    requiresConfirmationLabel: pick(map, "requiresConfirmationLabel"),
    requiresConfirmationHint: pick(map, "requiresConfirmationHint"),
    settingsSaveError: pick(map, "settingsSaveError"),
    callOutFeeLabel: pick(map, "callOutFeeLabel"),
    callOutFeeHint: pick(map, "callOutFeeHint"),
    callOutFeePlaceholder: pick(map, "callOutFeePlaceholder"),
    servicesOfferedTitle: pick(map, "servicesOfferedTitle"),
    servicesOfferedHint: pick(map, "servicesOfferedHint"),
    noActiveServices: pick(map, "noActiveServices"),
    servicesSaveError: pick(map, "servicesSaveError"),
    bookingsTitle: pick(map, "bookingsTitle"),
    noBookings: pick(map, "noBookings"),
    bookingStatusLabel: {
      pending: pick(map, "bookingStatus.pending"),
      confirmed: pick(map, "bookingStatus.confirmed"),
      completed: pick(map, "bookingStatus.completed"),
      cancelled: pick(map, "bookingStatus.cancelled"),
      no_show: pick(map, "bookingStatus.no_show"),
    },
    confirmBookingButton: pick(map, "confirmBookingButton"),
    cancelBookingButton: pick(map, "cancelBookingButton"),
    bookingActionError: pick(map, "bookingActionError"),
  };
}
