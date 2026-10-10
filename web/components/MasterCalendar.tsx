"use client";

/**
 * Букси-style visual calendar for the master's cabinet — day/week/month
 * grid over his own bookings plus manual time blocks (ProviderBlock, see
 * app/models.py), replacing the old flat "Мои брони" list. Self-contained
 * (own load + own mutations), same shape as WorkingHoursEditor.tsx: this
 * needs its own fairly involved local state (view/date, drag, three small
 * modals), not worth routing through CabinetDashboard.tsx's loadAll. Lives
 * in its own tab there now (see that file) rather than at the bottom of one
 * long page — the calendar is the master's main day-to-day screen, not one
 * more settings section.
 *
 * Drag-and-drop is pointer-events based (not native HTML5 draggable), so it
 * works on a phone too — the master's cabinet is a PWA meant to be used
 * from one (see pwa-handoff.md). Dragging MOVES an event (keeps its
 * duration); resizing is done through the details panel's time editor
 * instead of a drag handle on the block's edge — more reliable across
 * mouse/touch than an edge-drag, and needs no extra hit-testing code.
 *
 * Second pass (styling/organization): the modals, grid column, event chip
 * and month view used to all live inline in this one ~1180-line file — now
 * split into components/calendar/* (helpers.ts, CalendarModals.tsx,
 * EventChip.tsx, DayColumn.tsx, MonthView.tsx), with this file left as the
 * orchestrator (state, data loading, header, view switch). No behavior
 * changes from the split itself — see those files for the visual pass
 * (site color tokens instead of generic neutral/amber/emerald grays, and
 * the overflow fix on paired time inputs in narrow modals).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type ServiceToggle } from "@/lib/api";
import { addDays, toDateParam, warsawIso } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton } from "@/components/ui";
import {
  ChooseActionModal,
  EventDetailsModal,
  BlockForm,
  ManualBookingForm,
} from "@/components/calendar/CalendarModals";
import { DayColumn } from "@/components/calendar/DayColumn";
import { MonthView } from "@/components/calendar/MonthView";
import {
  type CalEvent,
  type ViewMode,
  GRID_END_HOUR_DEFAULT,
  GRID_START_HOUR_DEFAULT,
  monthTitle,
  pad2,
  timeToHhmm,
  toEvents,
  weekdayHeaderLabel,
} from "@/components/calendar/helpers";
import { businessHourMinute } from "@/lib/format";

export default function MasterCalendar() {
  const { locale, t } = useLocale();

  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [serviceToggles, setServiceToggles] = useState<ServiceToggle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [composer, setComposer] = useState<{
    dateStr: string;
    time: string;
    mode: "choose" | "booking" | "block";
  } | null>(null);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor };
    if (view === "week") {
      const weekday = (anchor.getDay() + 6) % 7; // 0=Monday
      const start = addDays(anchor, -weekday);
      return { from: start, to: addDays(start, 6) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const firstWeekday = (first.getDay() + 6) % 7;
    const lastWeekday = (last.getDay() + 6) % 7;
    return {
      from: addDays(first, -firstWeekday),
      to: addDays(last, 6 - lastWeekday),
    };
  }, [view, anchor]);

  const load = useCallback(async () => {
    try {
      const [cal, svc] = await Promise.all([
        api.getMyCalendar(toDateParam(range.from), toDateParam(range.to)),
        serviceToggles.length === 0
          ? api.getMyServices(locale)
          : Promise.resolve(serviceToggles),
      ]);
      setEvents(toEvents(cal.bookings, cal.blocks));
      setServiceToggles(svc);
      setLoaded(true);
      setLoadError(null);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      setLoadError(t.calendarLoadError);
    }
    // Re-fetch whenever the visible range changes; `t`/`locale`/`serviceToggles`
    // are read but shouldn't retrigger a load on their own (locale changes
    // fetch services fresh next time serviceToggles is empty; re-running
    // this on every serviceToggles identity change would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const serviceName = useCallback(
    (id: string) => serviceToggles.find((s) => s.service_id === id)?.name ?? "",
    [serviceToggles],
  );

  const dayStrs = useMemo(() => {
    const out: string[] = [];
    let d = range.from;
    while (toDateParam(d) <= toDateParam(range.to)) {
      out.push(toDateParam(d));
      d = addDays(d, 1);
      if (out.length > 42) break; // safety valve, a month view is at most 42 cells
    }
    return out;
  }, [range]);

  const gridBounds = useMemo(() => {
    let startHour = GRID_START_HOUR_DEFAULT;
    let endHour = GRID_END_HOUR_DEFAULT;
    for (const e of events) {
      const s = businessHourMinute(e.start_at);
      const en = businessHourMinute(e.end_at);
      startHour = Math.min(startHour, s.hour);
      endHour = Math.max(endHour, en.minute > 0 ? en.hour + 1 : en.hour);
    }
    return { startHour, endHour: Math.min(endHour, 24) };
  }, [events]);

  const handleEmptyClick = (dateStr: string, hour: number, minute: number) => {
    setComposer({ dateStr, time: timeToHhmm(hour, minute), mode: "choose" });
  };

  const handleDropEvent = async (
    event: CalEvent,
    targetDateStr: string,
    hour: number,
    minute: number,
  ) => {
    setDropError(null);
    const durationMs = Date.parse(event.end_at) - Date.parse(event.start_at);
    const startIso = warsawIso(targetDateStr, hour, minute);
    const endIso = new Date(Date.parse(startIso) + durationMs).toISOString();
    try {
      if (event.kind === "booking") {
        await api.rescheduleBooking(event.id, startIso, endIso);
      } else {
        await api.updateBlock(event.id, {
          start_at: startIso,
          end_at: endIso,
          reason: event.reason ?? undefined,
        });
      }
      await load();
    } catch (err) {
      setDropError(
        err instanceof ApiError && err.status === 409
          ? t.calendarConflictError
          : t.calendarRescheduleError,
      );
    }
  };

  // Лента дней внизу: ±~2 месяца вокруг сегодняшнего дня, прокручивается
  // горизонтально; выбранный день центрируется.
  const stripDays = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 91 }, (_, i) =>
      toDateParam(addDays(base, i - 30)),
    );
  }, []);
  const selectedChipRef = useRef<HTMLButtonElement | null>(null);
  const todayStr = toDateParam(new Date());
  const anchorStr = toDateParam(anchor);
  useEffect(() => {
    selectedChipRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [anchorStr]);
  const stripLabel = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const tag = locale === "pl" ? "pl-PL" : "en-GB";
    return {
      wd: new Intl.DateTimeFormat(tag, {
        weekday: "short",
        timeZone: "UTC",
      }).format(d),
      day: d.getUTCDate(),
    };
  };
  const openComposerNow = () => {
    const now = new Date();
    setComposer({
      dateStr: anchorStr,
      time: timeToHhmm(now.getHours(), now.getMinutes() < 30 ? 0 : 30),
      mode: "choose",
    });
  };

  const goToday = () => setAnchor(new Date());
  const goPrev = () =>
    setAnchor((d) =>
      addDays(d, view === "day" ? -1 : view === "week" ? -7 : -30),
    );
  const goNext = () =>
    setAnchor((d) => addDays(d, view === "day" ? 1 : view === "week" ? 7 : 30));

  const title =
    view === "month"
      ? monthTitle(anchor, locale)
      : view === "day"
        ? weekdayHeaderLabel(toDateParam(anchor), locale)
        : `${weekdayHeaderLabel(toDateParam(range.from), locale)} – ${weekdayHeaderLabel(toDateParam(range.to), locale)}`;

  return (
    <section className="pb-24">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
          <CompactButton
            variant="secondary"
            onClick={goPrev}
            aria-label={t.calendarPrevLabel}
            className="px-2.5"
          >
            ‹
          </CompactButton>
          <CompactButton
            variant="secondary"
            onClick={goNext}
            aria-label={t.calendarNextLabel}
            className="px-2.5"
          >
            ›
          </CompactButton>
          <CompactButton variant="secondary" onClick={goToday} className="ml-1">
            {t.calendarTodayButton}
          </CompactButton>
          <span className="ml-2 min-w-0 text-sm font-semibold capitalize text-ink">
            {title}
          </span>
        </div>
        <div className="flex gap-1 rounded-md border border-line bg-line/20 p-1 text-sm">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                view === v
                  ? "bg-bg text-ink shadow-sm"
                  : "text-ink/60 hover:text-ink"
              }`}
            >
              {v === "day"
                ? t.calendarViewDay
                : v === "week"
                  ? t.calendarViewWeek
                  : t.calendarViewMonth}
            </button>
          ))}
        </div>
      </div>

      {loadError && <p className="mb-2 text-sm text-danger">{loadError}</p>}
      {dropError && <p className="mb-2 text-sm text-danger">{dropError}</p>}

      {!loaded ? (
        <p className="text-sm text-ink/60">{t.loading}</p>
      ) : view === "month" ? (
        <MonthView
          t={t}
          dayStrs={dayStrs}
          events={events}
          anchor={anchor}
          onSelectDay={(dateStr) => {
            setAnchor(new Date(`${dateStr}T12:00:00Z`));
            setView("day");
          }}
        />
      ) : (
        <div className="overflow-x-auto border-y border-line sm:rounded-md sm:border">
          <div
            className="flex"
            style={{ minWidth: view === "week" ? 700 : undefined }}
          >
            <div className="w-6 shrink-0 border-r border-line sm:w-12">
              <div className="h-6 border-b border-line/60" />
              {Array.from({
                length: gridBounds.endHour - gridBounds.startHour,
              }).map((_, i) => (
                <div
                  key={i}
                  className="pr-0.5 text-right text-[12px] text-ink/40 sm:pr-0 sm:text-[10px]"
                  style={{ height: 60 }}
                >
                  <span className="sm:hidden">
                    {pad2(gridBounds.startHour + i)}
                  </span>
                  <span className="hidden sm:inline">
                    {pad2(gridBounds.startHour + i)}:00
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-1">
              {dayStrs.map((dateStr) => (
                <div key={dateStr} className="flex flex-1 flex-col">
                  <div className="h-6 border-b border-line/60 text-center text-xs font-medium capitalize text-ink/70">
                    {view === "week"
                      ? weekdayHeaderLabel(dateStr, locale)
                      : null}
                  </div>
                  <DayColumn
                    dateStr={dateStr}
                    events={events}
                    gridStartHour={gridBounds.startHour}
                    gridEndHour={gridBounds.endHour}
                    serviceName={serviceName}
                    onEmptyClick={handleEmptyClick}
                    onOpenEvent={setSelected}
                    onDropEvent={handleDropEvent}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg">
        <div className="flex items-stretch gap-1 px-2 py-2">
          <button
            type="button"
            onClick={goToday}
            className="shrink-0 rounded-lg border border-accent px-3 text-xs font-semibold text-accent-2"
          >
            {t.calendarTodayButton}
          </button>
          <div
            className="flex flex-1 gap-1 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {stripDays.map((ds) => {
              const { wd, day } = stripLabel(ds);
              const isSel = ds === anchorStr;
              const isToday = ds === todayStr;
              return (
                <button
                  key={ds}
                  ref={isSel ? selectedChipRef : undefined}
                  type="button"
                  onClick={() => setAnchor(new Date(`${ds}T12:00:00`))}
                  className={`flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5 text-xs transition sm:w-14 ${
                    isSel
                      ? "bg-accent text-white"
                      : isToday
                        ? "border border-accent text-accent-2"
                        : "text-ink/70"
                  }`}
                >
                  <span className="uppercase">{wd}</span>
                  <span className="text-base font-semibold">{day}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={openComposerNow}
        aria-label={t.calendarAddLabel}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl leading-none text-white shadow-lg sm:hidden"
      >
        +
      </button>

      {composer?.mode === "choose" && (
        <ChooseActionModal
          t={t}
          dateStr={composer.dateStr}
          time={composer.time}
          onClose={() => setComposer(null)}
          onPickBooking={() => setComposer({ ...composer, mode: "booking" })}
          onPickBlock={() => setComposer({ ...composer, mode: "block" })}
        />
      )}
      {composer?.mode === "booking" && (
        <ManualBookingForm
          key={`${composer.dateStr}-${composer.time}`}
          t={t}
          dateStr={composer.dateStr}
          initialTime={composer.time}
          services={serviceToggles}
          onClose={() => setComposer(null)}
          onCreated={() => {
            setComposer(null);
            void load();
          }}
        />
      )}
      {composer?.mode === "block" && (
        <BlockForm
          key={`${composer.dateStr}-${composer.time}`}
          t={t}
          dateStr={composer.dateStr}
          initialTime={composer.time}
          onClose={() => setComposer(null)}
          onSaved={() => {
            setComposer(null);
            void load();
          }}
        />
      )}
      {selected && (
        <EventDetailsModal
          t={t}
          locale={locale}
          event={selected}
          serviceName={serviceName}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
