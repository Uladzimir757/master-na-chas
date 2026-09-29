"use client";

/**
 * Month grid — a read-only overview (click a day to jump into Day view;
 * dragging individual appointments at month zoom isn't a sensible
 * interaction, Букси itself doesn't offer that either). Split out of
 * MasterCalendar.tsx and restyled to share the day/week grid's own tokens
 * (border-line, bg-bg, text-ink) instead of a separate neutral-gray palette
 * — the two views read as one calendar now, not two different widgets.
 */

import { businessHourMinute, toDateParam } from "@/lib/format";
import type { Translations } from "@/lib/i18n";
import { type CalEvent, eventsOnDay, timeToHhmm } from "./helpers";

export function MonthView({
  t,
  dayStrs,
  events,
  anchor,
  onSelectDay,
}: {
  t: Translations;
  dayStrs: string[];
  events: CalEvent[];
  anchor: Date;
  onSelectDay: (dateStr: string) => void;
}) {
  const todayStr = toDateParam(new Date());

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-line bg-line/60 text-xs">
      {t.weekdayLabels.map((label) => (
        <div key={label} className="bg-line/20 px-1 py-1.5 text-center font-medium text-ink/60">
          {label}
        </div>
      ))}
      {dayStrs.map((dateStr) => {
        const dayEvents = eventsOnDay(events, dateStr);
        const inMonth = new Date(`${dateStr}T00:00:00Z`).getUTCMonth() === anchor.getMonth();
        const isToday = dateStr === todayStr;
        return (
          <button
            key={dateStr}
            onClick={() => onSelectDay(dateStr)}
            className={`flex min-h-16 flex-col items-start gap-0.5 bg-bg p-1 text-left transition hover:bg-ink/[0.03] ${
              inMonth ? "" : "opacity-40"
            }`}
          >
            <span
              className={`text-[11px] ${
                isToday ? "rounded-full bg-accent px-1.5 font-medium text-bg" : "text-ink/60"
              }`}
            >
              {Number(dateStr.slice(8, 10))}
            </span>
            {dayEvents.slice(0, 2).map((e) => (
              <span key={e.id} className="w-full truncate rounded bg-ink/5 px-1 text-[10px] text-ink">
                {timeToHhmm(businessHourMinute(e.start_at).hour, businessHourMinute(e.start_at).minute)}{" "}
                {e.kind === "booking" ? e.client_name : (e.reason ?? t.calendarBlockDetailsTitle)}
              </span>
            ))}
            {dayEvents.length > 2 && (
              <span className="text-[10px] text-ink/40">{t.calendarMoreEvents(dayEvents.length - 2)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
