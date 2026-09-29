/**
 * Pure helpers + shared types for the master calendar (components/
 * MasterCalendar.tsx and its subcomponents in this folder). No React here —
 * everything below is plain data-in/data-out, kept separate so the view
 * components can stay focused on markup.
 */

import type { Booking, BookingStatus, CalendarBlock } from "@/lib/api";
import { businessHourMinute, dateKey } from "@/lib/format";
import type { LocaleCode } from "@/lib/locale";
import { toIntlTag } from "@/lib/locale";

export type ViewMode = "day" | "week" | "month";

export type CalEvent =
  | {
      kind: "booking";
      id: string;
      start_at: string;
      end_at: string;
      status: BookingStatus;
      client_name: string;
      client_phone: string | null;
      service_id: string;
    }
  | { kind: "block"; id: string; start_at: string; end_at: string; reason: string | null };

export const GRID_START_HOUR_DEFAULT = 7;
export const GRID_END_HOUR_DEFAULT = 21; // exclusive
export const PX_PER_MINUTE = 1; // 60px per hour row
export const SNAP_MINUTES = 15;
export const DRAG_THRESHOLD_PX = 4;

export function toEvents(bookings: Booking[], blocks: CalendarBlock[]): CalEvent[] {
  const bookingEvents: CalEvent[] = bookings.map((b) => ({
    kind: "booking",
    id: b.id,
    start_at: b.start_at,
    end_at: b.end_at,
    status: b.status,
    client_name: b.client_name,
    client_phone: b.client_phone,
    service_id: b.service_id,
  }));
  const blockEvents: CalEvent[] = blocks.map((b) => ({
    kind: "block",
    id: b.id,
    start_at: b.start_at,
    end_at: b.end_at,
    reason: b.reason,
  }));
  return [...bookingEvents, ...blockEvents];
}

export function eventsOnDay(events: CalEvent[], dateStr: string): CalEvent[] {
  return events.filter((e) => dateKey(e.start_at) === dateStr);
}

/** Greedy side-by-side column assignment for same-day overlapping events —
 * a busy master might have two things at once (a booking right up against
 * a personal block, say); this keeps both visible instead of stacked. Not a
 * true minimal-width interval-graph coloring (that's overkill for a
 * two-master handyman calendar), just "first free column, widen everyone
 * on that day if anything overlaps at all". */
export function assignColumns(events: CalEvent[]): (CalEvent & { col: number; totalCols: number })[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const active: { endMs: number; col: number }[] = [];
  const withCol: (CalEvent & { col: number })[] = [];
  for (const e of sorted) {
    const startMs = Date.parse(e.start_at);
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endMs <= startMs) active.splice(i, 1);
    }
    const usedCols = new Set(active.map((a) => a.col));
    let col = 0;
    while (usedCols.has(col)) col++;
    active.push({ endMs: Date.parse(e.end_at), col });
    withCol.push({ ...e, col });
  }
  const totalCols = withCol.reduce((m, e) => Math.max(m, e.col + 1), 1);
  return withCol.map((e) => ({ ...e, totalCols }));
}

export function eventTop(e: CalEvent, gridStartMinutes: number): number {
  const s = businessHourMinute(e.start_at);
  return (s.hour * 60 + s.minute - gridStartMinutes) * PX_PER_MINUTE;
}

export function eventHeight(e: CalEvent): number {
  const s = businessHourMinute(e.start_at);
  const en = businessHourMinute(e.end_at);
  const startMin = s.hour * 60 + s.minute;
  // A rare end-past-midnight event (relative to the start's own calendar
  // day) is clipped to end-of-day rather than drawn with a bogus negative
  // height — this calendar's events are short same-day jobs, so this only
  // ever matters for an edge case, not the common path.
  const endMin = en.hour * 60 + en.minute > startMin ? en.hour * 60 + en.minute : 24 * 60;
  return Math.max((endMin - startMin) * PX_PER_MINUTE, 18);
}

/** Status → color, all drawn from the site's own warm palette (--accent /
 * --accent-2 / --danger, see app/globals.css) instead of generic Tailwind
 * amber/emerald/red — keeps the calendar visually part of the same site as
 * the booking flow and cabinet, rather than a bolted-on admin widget. */
export function statusClasses(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "bg-accent/15 border border-accent/50 text-ink";
    case "confirmed":
      return "bg-accent-2 border border-accent-2 text-bg";
    case "completed":
      return "bg-accent-2/15 border border-accent-2/40 text-ink";
    case "no_show":
    case "cancelled":
      return "bg-danger/15 border border-danger/40 text-danger";
    default:
      return "bg-line/40 border border-line text-ink";
  }
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function timeToHhmm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function parseHhmm(v: string): { hour: number; minute: number } {
  const [h, m] = v.split(":").map((x) => Number(x));
  return { hour: h || 0, minute: m || 0 };
}

export function weekdayHeaderLabel(dateStr: string, locale: LocaleCode): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat(toIntlTag(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function monthTitle(anchor: Date, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(toIntlTag(locale), { month: "long", year: "numeric", timeZone: "Europe/Warsaw" }).format(anchor);
}
