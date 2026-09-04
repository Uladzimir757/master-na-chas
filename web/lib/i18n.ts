/**
 * Every user-facing string and the display locale live here — nowhere else.
 * Right now this only holds Russian, and that's fine for the current dev
 * stage; the point is that it's the ONE place that knows that. The real
 * pl/ru/uk system (planned for Этап 3 — a translation cache, deliberately
 * not in-code dictionaries, see docs/ai-and-reviews.md / decisions.md) swaps
 * in here without touching a single component: replace `t`/`LOCALE` below
 * with a hook that reads the visitor's language, keep the same keys.
 */

export const LOCALE = "ru-RU";

export const t = {
  loading: "Загрузка…",
  catalogLoadError: "Не удалось загрузить услуги. Проверьте связь и обновите страницу.",
  pickServiceTitle: "Выберите услугу",
  changeService: "← сменить услугу",
  durationMinutes: (n: number) => `${n} мин`,
  slotsLoading: "Загрузка слотов…",
  slotsLoadError: "Не удалось загрузить свободные слоты.",
  noSlotsInRange: (days: number) => `На ближайшие ${days} дней свободных слотов нет.`,
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
  priceFrom: (v: number) => `от ${v} zł`,
  priceRange: (min: number, max: number) => `${min}–${max} zł`,
  pageTitle: "Мастер на час — запись",
  pageDescription: "Онлайн-запись на услуги мастера — слоты в реальном времени",
  htmlLang: "ru",
  defaultMasterName: "мастер",
};
