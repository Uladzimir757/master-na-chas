import { LOCALE, t } from "./i18n";

/** Everything renders in Europe/Warsaw regardless of the visitor's own
 * timezone — the business is there, a slot means "9am in Gdynia", not
 * "9am wherever the client happens to be". */
const TZ = "Europe/Warsaw";

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: TZ }).format(d);
  const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: TZ }).format(d);

  if (isToday) return `${t.today}, ${dayMonth}`;
  if (isTomorrow) return `${t.tomorrow}, ${dayMonth}`;
  return `${weekday}, ${dayMonth}`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function dateKey(iso: string): string {
  // YYYY-MM-DD in business-local time, used to group slots by day
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateParam(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function formatPriceRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return t.priceRange(min, max);
  const v = min ?? max;
  return v == null ? null : t.priceFrom(v);
}
