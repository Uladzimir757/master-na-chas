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

export function businessHour(iso: string): number {
  // Hour-of-day in Europe/Warsaw, for bucketing slots into Утро/День/Вечер
  // (SlotPicker.tsx) — same "business-local time" rule as dateKey below.
  // % 24: some Intl implementations format midnight as "24" rather than "00".
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(new Date(iso)));
  return hour % 24;
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

// MasterCalendar.tsx is the first place this frontend ever needs to go the
// OTHER direction: turn a wall-clock time the master picked by clicking a
// grid cell (a date + hour + minute, always meant as Europe/Warsaw local
// time — see the TZ comment at the top of this file) into a tz-aware ISO
// string the API will accept (app/schemas.py's _require_tz_aware). Every
// other write in this app (booking a slot, a working-hours exception date)
// only ever forwards an ISO string the backend already produced, or a bare
// date/time-of-day with no offset at all — nothing before this needed to
// compute Warsaw's UTC offset itself.
function warsawUtcOffset(dateStr: string): string {
  // Format a fixed UTC noon instant *on that calendar date* in the target
  // zone and read back its offset, rather than asking what "now" is — a
  // date far from today (a master planning next month) must still resolve
  // to whatever offset Europe/Warsaw actually used/will use on THAT date
  // (CET +01:00 vs CEST +02:00), not today's. Noon avoids any ambiguity
  // right at a DST transition, which in Europe always lands overnight,
  // well outside any plausible business-hours click.
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(probe);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tzName);
  if (!m) return "+01:00";
  const [, sign, hh, mm] = m;
  return `${sign}${hh.padStart(2, "0")}:${(mm ?? "00").padStart(2, "0")}`;
}

/** dateStr "YYYY-MM-DD" + a business-local hour/minute -> a tz-aware ISO
 * string in Europe/Warsaw's offset for that date, ready to POST/PATCH. */
export function warsawIso(dateStr: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:00${warsawUtcOffset(dateStr)}`;
}

/** Business-local {hour, minute} of an ISO instant — same Europe/Warsaw rule
 * as businessHour() above, just with minute precision too (needed to
 * position an event inside an hour row on the calendar grid). */
export function businessHourMinute(iso: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

export function formatPriceRange(min: number | null, max: number | null, t: Translations): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return t.priceRange(min, max);
  const v = min ?? max;
  return v == null ? null : t.priceFrom(v);
}
