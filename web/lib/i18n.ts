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
  brandName: string;
  heroTitle: string;
  heroSubtitle: string;
  timeOfDayMorning: string;
  timeOfDayAfternoon: string;
  timeOfDayEvening: string;
  continueToFormButton: string;
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
  showPassword: string;
  hidePassword: string;
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

  // Этап 4 — live location dot.
  shareLocationLabel: string;
  shareLocationHint: string;
  locationSharingActive: string;
  locationSharingWaiting: string;
  locationSharingDenied: string;
  locationSharingUnsupported: string;
  locationSharingError: string;
  masterLocationTitle: string;
  masterLocationJustNow: string;
  masterLocationMinutesAgo: (n: number) => string;

  // "Занят сейчас" — general busy toggle, see components/CabinetDashboard.tsx.
  busyTitle: string;
  busyHint: string;
  startBusyButton: string;
  finishBusyButton: string;
  busyStatusSince: (time: string) => string;
  busyUntilText: (time: string) => string;
  busyOpenEndedNote: string;
  busyEstimateLabel: string;
  busyEstimateHint: string;
  busyEstimatePlaceholder: string;
  busyActionError: string;

  // Master changing their own password — components/CabinetDashboard.tsx.
  changePasswordTitle: string;
  currentPasswordPlaceholder: string;
  newPasswordPlaceholder: string;
  confirmNewPasswordPlaceholder: string;
  changePasswordButton: string;
  changingPassword: string;
  changePasswordSuccess: string;
  changePasswordMismatchError: string;
  changePasswordTooShortError: string;
  changePasswordWrongCurrentError: string;
  changePasswordGenericError: string;

  // Master picker — the home page now opens on a list of masters (sorted
  // by rating) instead of jumping straight into the calendar, see
  // components/MasterPicker.tsx.
  pickMasterTitle: string;
  masterListLoadError: string;
  ratingValue: (rating: number, count: number) => string;
  noRatingYet: string;
  chooseMasterButton: string;
  backToMasters: string;
  masterServicesLoadError: string;
  noServicesOffered: string;

  // Per-service price/description, set by the master —
  // components/CabinetDashboard.tsx's services checklist.
  servicePriceMinPlaceholder: string;
  servicePriceMaxPlaceholder: string;
  serviceDescriptionPlaceholder: string;

  // "Мои рабочие часы" — components/WorkingHoursEditor.tsx. Weekly template
  // (multiple intervals per day allowed, e.g. a lunch gap) + per-date
  // exceptions (day off / custom hours on a specific date).
  workingHoursTitle: string;
  workingHoursHint: string;
  workingHoursLoadError: string;
  weekdayLabels: string[]; // index 0=Monday .. 6=Sunday, matches WorkingHoursSlot.weekday
  workingHoursDayOff: string;
  workingHoursFromLabel: string;
  workingHoursToLabel: string;
  workingHoursAddIntervalButton: string;
  workingHoursRemoveIntervalLabel: string;
  workingHoursValidationHint: string;
  workingHoursSaveButton: string;
  workingHoursSaving: string;
  workingHoursSaveError: string;

  workingHoursExceptionsTitle: string;
  workingHoursExceptionsHint: string;
  workingHoursNoExceptions: string;
  workingHoursExceptionDayOffLabel: string;
  workingHoursReasonLabel: string;
  workingHoursDeleteExceptionLabel: string;
  workingHoursExceptionDeleteError: string;

  workingHoursAddExceptionTitle: string;
  workingHoursExceptionDateLabel: string;
  workingHoursExceptionDayOffOption: string;
  workingHoursExceptionCustomHoursOption: string;
  workingHoursExceptionReasonPlaceholder: string;
  workingHoursAddExceptionButton: string;
  workingHoursSavingException: string;
  workingHoursExceptionSaveError: string;
}

export function buildTranslations(map: TranslationMap): Translations {
  return {
    brandName: pick(map, "brandName"),
    heroTitle: pick(map, "heroTitle"),
    heroSubtitle: pick(map, "heroSubtitle"),
    timeOfDayMorning: pick(map, "timeOfDayMorning"),
    timeOfDayAfternoon: pick(map, "timeOfDayAfternoon"),
    timeOfDayEvening: pick(map, "timeOfDayEvening"),
    continueToFormButton: pick(map, "continueToFormButton"),
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
    showPassword: pick(map, "showPassword"),
    hidePassword: pick(map, "hidePassword"),
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

    shareLocationLabel: pick(map, "shareLocationLabel"),
    shareLocationHint: pick(map, "shareLocationHint"),
    locationSharingActive: pick(map, "locationSharingActive"),
    locationSharingWaiting: pick(map, "locationSharingWaiting"),
    locationSharingDenied: pick(map, "locationSharingDenied"),
    locationSharingUnsupported: pick(map, "locationSharingUnsupported"),
    locationSharingError: pick(map, "locationSharingError"),
    masterLocationTitle: pick(map, "masterLocationTitle"),
    masterLocationJustNow: pick(map, "masterLocationJustNow"),
    masterLocationMinutesAgo: (n) => interpolate(pick(map, "masterLocationMinutesAgo"), { n }),

    busyTitle: pick(map, "busyTitle"),
    busyHint: pick(map, "busyHint"),
    startBusyButton: pick(map, "startBusyButton"),
    finishBusyButton: pick(map, "finishBusyButton"),
    busyStatusSince: (time) => interpolate(pick(map, "busyStatusSince"), { time }),
    busyUntilText: (time) => interpolate(pick(map, "busyUntilText"), { time }),
    busyOpenEndedNote: pick(map, "busyOpenEndedNote"),
    busyEstimateLabel: pick(map, "busyEstimateLabel"),
    busyEstimateHint: pick(map, "busyEstimateHint"),
    busyEstimatePlaceholder: pick(map, "busyEstimatePlaceholder"),
    busyActionError: pick(map, "busyActionError"),

    changePasswordTitle: pick(map, "changePasswordTitle"),
    currentPasswordPlaceholder: pick(map, "currentPasswordPlaceholder"),
    newPasswordPlaceholder: pick(map, "newPasswordPlaceholder"),
    confirmNewPasswordPlaceholder: pick(map, "confirmNewPasswordPlaceholder"),
    changePasswordButton: pick(map, "changePasswordButton"),
    changingPassword: pick(map, "changingPassword"),
    changePasswordSuccess: pick(map, "changePasswordSuccess"),
    changePasswordMismatchError: pick(map, "changePasswordMismatchError"),
    changePasswordTooShortError: pick(map, "changePasswordTooShortError"),
    changePasswordWrongCurrentError: pick(map, "changePasswordWrongCurrentError"),
    changePasswordGenericError: pick(map, "changePasswordGenericError"),

    pickMasterTitle: pick(map, "pickMasterTitle"),
    masterListLoadError: pick(map, "masterListLoadError"),
    ratingValue: (rating, count) => interpolate(pick(map, "ratingValue"), { rating, count }),
    noRatingYet: pick(map, "noRatingYet"),
    chooseMasterButton: pick(map, "chooseMasterButton"),
    backToMasters: pick(map, "backToMasters"),
    masterServicesLoadError: pick(map, "masterServicesLoadError"),
    noServicesOffered: pick(map, "noServicesOffered"),

    servicePriceMinPlaceholder: pick(map, "servicePriceMinPlaceholder"),
    servicePriceMaxPlaceholder: pick(map, "servicePriceMaxPlaceholder"),
    serviceDescriptionPlaceholder: pick(map, "serviceDescriptionPlaceholder"),

    workingHoursTitle: pick(map, "workingHoursTitle"),
    workingHoursHint: pick(map, "workingHoursHint"),
    workingHoursLoadError: pick(map, "workingHoursLoadError"),
    weekdayLabels: [
      pick(map, "weekdayMon"),
      pick(map, "weekdayTue"),
      pick(map, "weekdayWed"),
      pick(map, "weekdayThu"),
      pick(map, "weekdayFri"),
      pick(map, "weekdaySat"),
      pick(map, "weekdaySun"),
    ],
    workingHoursDayOff: pick(map, "workingHoursDayOff"),
    workingHoursFromLabel: pick(map, "workingHoursFromLabel"),
    workingHoursToLabel: pick(map, "workingHoursToLabel"),
    workingHoursAddIntervalButton: pick(map, "workingHoursAddIntervalButton"),
    workingHoursRemoveIntervalLabel: pick(map, "workingHoursRemoveIntervalLabel"),
    workingHoursValidationHint: pick(map, "workingHoursValidationHint"),
    workingHoursSaveButton: pick(map, "workingHoursSaveButton"),
    workingHoursSaving: pick(map, "workingHoursSaving"),
    workingHoursSaveError: pick(map, "workingHoursSaveError"),

    workingHoursExceptionsTitle: pick(map, "workingHoursExceptionsTitle"),
    workingHoursExceptionsHint: pick(map, "workingHoursExceptionsHint"),
    workingHoursNoExceptions: pick(map, "workingHoursNoExceptions"),
    workingHoursExceptionDayOffLabel: pick(map, "workingHoursExceptionDayOffLabel"),
    workingHoursReasonLabel: pick(map, "workingHoursReasonLabel"),
    workingHoursDeleteExceptionLabel: pick(map, "workingHoursDeleteExceptionLabel"),
    workingHoursExceptionDeleteError: pick(map, "workingHoursExceptionDeleteError"),

    workingHoursAddExceptionTitle: pick(map, "workingHoursAddExceptionTitle"),
    workingHoursExceptionDateLabel: pick(map, "workingHoursExceptionDateLabel"),
    workingHoursExceptionDayOffOption: pick(map, "workingHoursExceptionDayOffOption"),
    workingHoursExceptionCustomHoursOption: pick(map, "workingHoursExceptionCustomHoursOption"),
    workingHoursExceptionReasonPlaceholder: pick(map, "workingHoursExceptionReasonPlaceholder"),
    workingHoursAddExceptionButton: pick(map, "workingHoursAddExceptionButton"),
    workingHoursSavingException: pick(map, "workingHoursSavingException"),
    workingHoursExceptionSaveError: pick(map, "workingHoursExceptionSaveError"),
  };
}
