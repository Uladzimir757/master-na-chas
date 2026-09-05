import type { Translations } from "./i18n";
import { toIntlTag, type LocaleCode } from "./locale";

/** Everything renders in Europe/Warsaw regardless of the visitor's own
 * timezone — the business is there, a slot means "9am in Gdynia", not
 * "9am wherever the client happens to be". */
const TZ = "Europe/Warsaw";

export function formatDayLabel(iso: string, locale: LocaleCode, t: Translations): string {
  const intlTag = toIntlTag(locale);
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const weekday = new Intl.DateTimeFormat(intlTag, { weekday: "short", timeZone: TZ }).format(d);
  const dayMonth = new Intl.DateTimeFormat(intlTag, { day: "numeric", month: "short", timeZone: TZ }).format(d);

  if (isToday) return `${t.today}, ${dayMonth}`;
  if (isTomorrow) return `${t.tomorrow}, ${dayMonth}`;
  return `${weekday}, ${dayMonth}`;
}

export function formatTime(iso: string, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(toIntlTag(locale), { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(
    new Date(iso),
  );
}

export function dateKey(iso: string): string {
  // YYYY-MM-DD in business-local time, used to group slots by day — a
  // fixed en-CA formatting trick for the ISO shape, unrelated to the
  // visitor's own locale.
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

export function formatPriceRange(min: number | null, max: number | null, t: Translations): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return t.priceRange(min, max);
  const v = min ?? max;
  return v == null ? null : t.priceFrom(v);
}
