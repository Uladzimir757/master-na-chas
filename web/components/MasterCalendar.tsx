"use client";

/**
 * Букси-style visual calendar for the master's cabinet — day/week/month
 * grid over his own bookings plus manual time blocks (ProviderBlock, see
 * app/models.py), replacing the old flat "Мои брони" list. Self-contained
 * (own load + own mutations), same shape as WorkingHoursEditor.tsx: this
 * needs its own fairly involved local state (view/date, drag, three small
 * modals), not worth routing through CabinetDashboard.tsx's loadAll.
 *
 * Drag-and-drop is pointer-events based (not native HTML5 draggable), so it
 * works on a phone too — the master's cabinet is a PWA meant to be used
 * from one (see pwa-handoff.md). Dragging MOVES an event (keeps its
 * duration); resizing is done through the details panel's time editor
 * instead of a drag handle on the block's edge — more reliable across
 * mouse/touch than an edge-drag, and needs no extra hit-testing code.
 *
 * Month view is a read-only overview (click a day to jump into Day view) —
 * dragging individual appointments at month zoom isn't a sensible
 * interaction Букси itself doesn't really offer that either.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  type Booking,
  type BookingStatus,
  type CalendarBlock,
  type ServiceToggle,
} from "@/lib/api";
import { addDays, businessHourMinute, dateKey, toDateParam, warsawIso } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import type { Translations } from "@/lib/i18n";
import type { LocaleCode } from "@/lib/locale";
import { toIntlTag } from "@/lib/locale";

type ViewMode = "day" | "week" | "month";

type CalEvent =
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

const GRID_START_HOUR_DEFAULT = 7;
const GRID_END_HOUR_DEFAULT = 21; // exclusive
const PX_PER_MINUTE = 1; // 60px per hour row
const SNAP_MINUTES = 15;
const DRAG_THRESHOLD_PX = 4;

function toEvents(bookings: Booking[], blocks: CalendarBlock[]): CalEvent[] {
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

function eventsOnDay(events: CalEvent[], dateStr: string): CalEvent[] {
  return events.filter((e) => dateKey(e.start_at) === dateStr);
}

/** Greedy side-by-side column assignment for same-day overlapping events —
 * a busy master might have two things at once (a booking right up against
 * a personal block, say); this keeps both visible instead of stacked. Not a
 * true minimal-width interval-graph coloring (that's overkill for a
 * two-master handyman calendar), just "first free column, widen everyone
 * on that day if anything overlaps at all". */
function assignColumns(events: CalEvent[]): (CalEvent & { col: number; totalCols: number })[] {
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

function eventTop(e: CalEvent, gridStartMinutes: number): number {
  const s = businessHourMinute(e.start_at);
  return (s.hour * 60 + s.minute - gridStartMinutes) * PX_PER_MINUTE;
}

function eventHeight(e: CalEvent): number {
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

function statusClasses(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 border border-amber-300 text-amber-900";
    case "confirmed":
      return "bg-neutral-900 border border-neutral-900 text-white";
    case "completed":
      return "bg-emerald-100 border border-emerald-300 text-emerald-900";
    case "no_show":
      return "bg-red-100 border border-red-300 text-red-900";
    default:
      return "bg-neutral-100 border border-neutral-300 text-neutral-900";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function timeToHhmm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseHhmm(v: string): { hour: number; minute: number } {
  const [h, m] = v.split(":").map((x) => Number(x));
  return { hour: h || 0, minute: m || 0 };
}

function weekdayHeaderLabel(dateStr: string, locale: LocaleCode): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat(toIntlTag(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

function monthTitle(anchor: Date, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(toIntlTag(locale), { month: "long", year: "numeric", timeZone: "Europe/Warsaw" }).format(anchor);
}

// ----------------------------------------------------------------------------
// Simple modal shell shared by the three popovers below.
// ----------------------------------------------------------------------------

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// "Что добавить?" choice popover -> manual booking form / block form.
// ----------------------------------------------------------------------------

function ChooseActionModal({
  t,
  dateStr,
  time,
  onClose,
  onPickBooking,
  onPickBlock,
}: {
  t: Translations;
  dateStr: string;
  time: string;
  onClose: () => void;
  onPickBooking: () => void;
  onPickBlock: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <h3 className="mb-1 text-sm font-medium text-neutral-900">{t.calendarChooseActionTitle}</h3>
      <p className="mb-3 text-sm text-neutral-500">
        {dateStr}, {time}
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={onPickBooking}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white hover:brightness-110"
        >
          {t.calendarAddBookingButton}
        </button>
        <button
          onClick={onPickBlock}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
        >
          {t.calendarBlockTimeButton}
        </button>
        <button onClick={onClose} className="mt-1 text-sm text-neutral-500 hover:text-neutral-800">
          {t.calendarCloseButton}
        </button>
      </div>
    </Modal>
  );
}

function ManualBookingForm({
  t,
  dateStr,
  initialTime,
  services,
  onClose,
  onCreated,
}: {
  t: Translations;
  dateStr: string;
  initialTime: string;
  services: ServiceToggle[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const offered = useMemo(() => services.filter((s) => s.is_offered), [services]);
  const [serviceId, setServiceId] = useState(offered[0]?.service_id ?? "");
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(offered[0]?.duration_minutes ?? 60);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleServiceChange = (id: string) => {
    setServiceId(id);
    const svc = offered.find((s) => s.service_id === id);
    if (svc) setDuration(svc.duration_minutes);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId || !clientName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { hour, minute } = parseHhmm(time);
      await api.createManualBooking({
        service_id: serviceId,
        start_at: warsawIso(dateStr, hour, minute),
        duration_minutes: duration,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409 ? t.calendarConflictError : t.calendarCreateBookingError,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-3 text-sm font-medium text-neutral-900">{t.calendarNewBookingTitle}</h3>
      {offered.length === 0 ? (
        <p className="text-sm text-neutral-500">{t.noActiveServices}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t.calendarServiceLabel}
            <select
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            >
              {offered.map((s) => (
                <option key={s.service_id} value={s.service_id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              {t.calendarTimeLabel}
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              {t.calendarDurationLabel}
              <input
                type="number"
                min={5}
                step={5}
                required
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded-lg border border-neutral-300 px-3 py-1.5"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t.calendarClientNameLabel}
            <input
              type="text"
              required
              maxLength={200}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t.calendarClientNamePlaceholder}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.calendarClientPhoneLabel}
            <input
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder={t.calendarClientPhonePlaceholder}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.calendarNotesLabel}
            <input
              type="text"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.calendarNotesPlaceholder}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {saving ? t.calendarCreatingBooking : t.calendarCreateBookingButton}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
              {t.calendarCloseButton}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function BlockForm({
  t,
  dateStr,
  initialTime,
  initialDurationMinutes = 60,
  editing,
  onClose,
  onSaved,
}: {
  t: Translations;
  dateStr: string;
  initialTime: string;
  initialDurationMinutes?: number;
  editing?: { id: string; reason: string | null; endTime: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startTime, setStartTime] = useState(initialTime);
  const [endTime, setEndTime] = useState(
    editing?.endTime ??
      (() => {
        const { hour, minute } = parseHhmm(initialTime);
        const total = hour * 60 + minute + initialDurationMinutes;
        return timeToHhmm(Math.min(23, Math.floor(total / 60)), total % 60);
      })(),
  );
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const s = parseHhmm(startTime);
      const en = parseHhmm(endTime);
      const payload = {
        start_at: warsawIso(dateStr, s.hour, s.minute),
        end_at: warsawIso(dateStr, en.hour, en.minute),
        reason: reason.trim() || undefined,
      };
      if (editing) {
        await api.updateBlock(editing.id, payload);
      } else {
        await api.createBlock(payload);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409 ? t.calendarConflictError : t.calendarCreateBlockError,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-3 text-sm font-medium text-neutral-900">{t.calendarNewBlockTitle}</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t.calendarTimeLabel}
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t.calendarEndTimeLabel}
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {t.calendarBlockReasonLabel}
          <input
            type="text"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.calendarBlockReasonPlaceholder}
            className="rounded-lg border border-neutral-300 px-3 py-1.5"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            {saving ? t.calendarCreatingBlock : t.calendarCreateBlockButton}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
            {t.calendarCloseButton}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EventDetailsModal({
  t,
  locale,
  event,
  serviceName,
  onClose,
  onChanged,
}: {
  t: Translations;
  locale: LocaleCode;
  event: CalEvent;
  serviceName: (id: string) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);

  const dateStr = dateKey(event.start_at);
  const startHm = businessHourMinute(event.start_at);
  const endHm = businessHourMinute(event.end_at);

  const handleStatus = async (status: BookingStatus) => {
    if (event.kind !== "booking") return;
    setBusy(true);
    setError(null);
    try {
      await api.updateBookingStatus(event.id, status);
      onChanged();
    } catch {
      setError(t.bookingActionError);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBlock = async () => {
    if (event.kind !== "block") return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteBlock(event.id);
      onChanged();
    } catch {
      setError(t.calendarDeleteBlockError);
    } finally {
      setBusy(false);
    }
  };

  if (editingTime) {
    return (
      <BlockFormOrRescheduleTime
        t={t}
        event={event}
        dateStr={dateStr}
        onClose={() => setEditingTime(false)}
        onSaved={() => {
          setEditingTime(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <Modal onClose={onClose}>
      {event.kind === "booking" ? (
        <>
          <h3 className="mb-1 text-sm font-medium text-neutral-900">{serviceName(event.service_id)}</h3>
          <p className="mb-1 text-sm text-neutral-500">
            {weekdayHeaderLabel(dateStr, locale)}, {timeToHhmm(startHm.hour, startHm.minute)}–
            {timeToHhmm(endHm.hour, endHm.minute)}
          </p>
          <p className="mb-3 text-sm text-neutral-500">
            {event.client_name}
            {event.client_phone ? ` · ${event.client_phone}` : ""}
          </p>
          <span className={`mb-3 inline-block rounded-full px-2.5 py-1 text-xs ${statusClasses(event.status)}`}>
            {t.bookingStatusLabel[event.status] ?? event.status}
          </span>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {event.status === "pending" && (
              <button
                disabled={busy}
                onClick={() => handleStatus("confirmed")}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
              >
                {t.confirmBookingButton}
              </button>
            )}
            {(event.status === "pending" || event.status === "confirmed") && (
              <button
                disabled={busy}
                onClick={() => handleStatus("cancelled")}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                {t.cancelBookingButton}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => setEditingTime(true)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t.calendarEditTimeButton}
            </button>
            <button onClick={onClose} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800">
              {t.calendarCloseButton}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="mb-1 text-sm font-medium text-neutral-900">{t.calendarBlockDetailsTitle}</h3>
          <p className="mb-1 text-sm text-neutral-500">
            {weekdayHeaderLabel(dateStr, locale)}, {timeToHhmm(startHm.hour, startHm.minute)}–
            {timeToHhmm(endHm.hour, endHm.minute)}
          </p>
          {event.reason && <p className="mb-3 text-sm text-neutral-700">{event.reason}</p>}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => setEditingTime(true)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t.calendarEditTimeButton}
            </button>
            <button
              disabled={busy}
              onClick={handleDeleteBlock}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
            >
              {busy ? t.calendarDeletingBlock : t.calendarDeleteBlockButton}
            </button>
            <button onClick={onClose} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800">
              {t.calendarCloseButton}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** The details panel's "изменить время" sub-form — a plain start/end time
 * editor, reused for both a booking (reschedule) and a block (resize/move),
 * since editing an event's time by typing new values is far more reliable
 * across devices than an edge-drag handle. */
function BlockFormOrRescheduleTime({
  t,
  event,
  dateStr,
  onClose,
  onSaved,
}: {
  t: Translations;
  event: CalEvent;
  dateStr: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const startHm = businessHourMinute(event.start_at);
  const endHm = businessHourMinute(event.end_at);
  const [startTime, setStartTime] = useState(timeToHhmm(startHm.hour, startHm.minute));
  const [endTime, setEndTime] = useState(timeToHhmm(endHm.hour, endHm.minute));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const s = parseHhmm(startTime);
      const en = parseHhmm(endTime);
      const startIso = warsawIso(dateStr, s.hour, s.minute);
      const endIso = warsawIso(dateStr, en.hour, en.minute);
      if (event.kind === "booking") {
        await api.rescheduleBooking(event.id, startIso, endIso);
      } else {
        await api.updateBlock(event.id, { start_at: startIso, end_at: endIso, reason: event.reason ?? undefined });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? t.calendarConflictError : t.calendarRescheduleError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-3 text-sm font-medium text-neutral-900">{t.calendarEditTimeButton}</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t.calendarTimeLabel}
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t.calendarEndTimeLabel}
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            {saving ? t.calendarSavingTime : t.calendarSaveTimeButton}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
            {t.calendarCloseButton}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// One event chip inside a day column — handles its own drag-to-move via
// pointer events (works for mouse AND touch, unlike native HTML5 DnD).
// ----------------------------------------------------------------------------

function EventChip({
  event,
  col,
  totalCols,
  gridStartMinutes,
  serviceName,
  onOpen,
  onDropped,
}: {
  event: CalEvent;
  col: number;
  totalCols: number;
  gridStartMinutes: number;
  serviceName: (id: string) => string;
  onOpen: (e: CalEvent) => void;
  onDropped: (targetDateStr: string, newHour: number, newMinute: number) => Promise<void>;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<{ dx: number; dy: number } | null>(null);

  const top = eventTop(event, gridStartMinutes);
  const height = eventHeight(event);
  const widthPct = 100 / totalCols;
  const leftPct = col * widthPct;

  const handlePointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = { pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, moved: false };
  };

  const handlePointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) drag.moved = true;
    if (drag.moved) setPreview({ dx, dy });
  };

  const handlePointerUp = async (ev: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    if (!drag.moved) {
      onOpen(event);
      return;
    }
    const dy = ev.clientY - drag.startY;
    setPreview(null);

    const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-daykey]") as HTMLElement | null;
    const targetDateStr = targetEl?.dataset.daykey ?? dateKey(event.start_at);

    const snappedDelta = Math.round(dy / PX_PER_MINUTE / SNAP_MINUTES) * SNAP_MINUTES;
    const orig = businessHourMinute(event.start_at);
    let newTotal = orig.hour * 60 + orig.minute + snappedDelta;
    newTotal = Math.max(0, Math.min(newTotal, 24 * 60 - SNAP_MINUTES));

    await onDropped(targetDateStr, Math.floor(newTotal / 60), newTotal % 60);
  };

  const label =
    event.kind === "booking"
      ? `${timeToHhmm(businessHourMinute(event.start_at).hour, businessHourMinute(event.start_at).minute)} ${serviceName(event.service_id)}`
      : `${timeToHhmm(businessHourMinute(event.start_at).hour, businessHourMinute(event.start_at).minute)} ${event.reason ?? ""}`;

  const sub = event.kind === "booking" ? event.client_name : null;

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        transform: preview ? `translate(${preview.dx}px, ${preview.dy}px)` : undefined,
        zIndex: preview ? 20 : 1,
        touchAction: "none",
        cursor: "grab",
      }}
      className={`overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight shadow-sm ${
        event.kind === "booking" ? statusClasses(event.status) : "border border-dashed border-neutral-400 bg-neutral-200 text-neutral-600"
      }`}
    >
      <div className="truncate font-medium">{label}</div>
      {sub && <div className="truncate opacity-80">{sub}</div>}
    </div>
  );
}

// ----------------------------------------------------------------------------
// One day's grid column, reused by both Day view (one column) and Week view
// (seven of these side by side).
// ----------------------------------------------------------------------------

function DayColumn({
  dateStr,
  events,
  gridStartHour,
  gridEndHour,
  serviceName,
  onEmptyClick,
  onOpenEvent,
  onDropEvent,
}: {
  dateStr: string;
  events: CalEvent[];
  gridStartHour: number;
  gridEndHour: number;
  serviceName: (id: string) => string;
  onEmptyClick: (dateStr: string, hour: number, minute: number) => void;
  onOpenEvent: (e: CalEvent) => void;
  onDropEvent: (event: CalEvent, targetDateStr: string, hour: number, minute: number) => Promise<void>;
}) {
  const gridStartMinutes = gridStartHour * 60;
  const totalHeight = (gridEndHour - gridStartHour) * 60 * PX_PER_MINUTE;
  const dayEvents = useMemo(() => assignColumns(eventsOnDay(events, dateStr)), [events, dateStr]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMinutes = gridStartMinutes + y / PX_PER_MINUTE;
    const snapped = Math.max(0, Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES);
    onEmptyClick(dateStr, Math.floor(snapped / 60), snapped % 60);
  };

  return (
    <div
      data-daykey={dateStr}
      onClick={handleClick}
      className="relative flex-1 border-l border-neutral-200"
      style={{ height: totalHeight }}
    >
      {Array.from({ length: gridEndHour - gridStartHour }).map((_, i) => (
        <div key={i} className="absolute left-0 right-0 border-t border-neutral-100" style={{ top: i * 60 * PX_PER_MINUTE }} />
      ))}
      {dayEvents.map((e) => (
        <EventChip
          key={e.id}
          event={e}
          col={e.col}
          totalCols={e.totalCols}
          gridStartMinutes={gridStartMinutes}
          serviceName={serviceName}
          onOpen={onOpenEvent}
          onDropped={(targetDateStr, hour, minute) => onDropEvent(e, targetDateStr, hour, minute)}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

export default function MasterCalendar() {
  const { locale, t } = useLocale();

  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [serviceToggles, setServiceToggles] = useState<ServiceToggle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [composer, setComposer] = useState<{ dateStr: string; time: string; mode: "choose" | "booking" | "block" } | null>(
    null,
  );
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
    return { from: addDays(first, -firstWeekday), to: addDays(last, 6 - lastWeekday) };
  }, [view, anchor]);

  const load = useCallback(async () => {
    try {
      const [cal, svc] = await Promise.all([
        api.getMyCalendar(toDateParam(range.from), toDateParam(range.to)),
        serviceToggles.length === 0 ? api.getMyServices(locale) : Promise.resolve(serviceToggles),
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

  const handleDropEvent = async (event: CalEvent, targetDateStr: string, hour: number, minute: number) => {
    setDropError(null);
    const durationMs = Date.parse(event.end_at) - Date.parse(event.start_at);
    const startIso = warsawIso(targetDateStr, hour, minute);
    const endIso = new Date(Date.parse(startIso) + durationMs).toISOString();
    try {
      if (event.kind === "booking") {
        await api.rescheduleBooking(event.id, startIso, endIso);
      } else {
        await api.updateBlock(event.id, { start_at: startIso, end_at: endIso, reason: event.reason ?? undefined });
      }
      await load();
    } catch (err) {
      setDropError(err instanceof ApiError && err.status === 409 ? t.calendarConflictError : t.calendarRescheduleError);
    }
  };

  const goToday = () => setAnchor(new Date());
  const goPrev = () => setAnchor((d) => addDays(d, view === "day" ? -1 : view === "week" ? -7 : -30));
  const goNext = () => setAnchor((d) => addDays(d, view === "day" ? 1 : view === "week" ? 7 : 30));

  const title =
    view === "month"
      ? monthTitle(anchor, locale)
      : view === "day"
        ? weekdayHeaderLabel(toDateParam(anchor), locale)
        : `${weekdayHeaderLabel(toDateParam(range.from), locale)} – ${weekdayHeaderLabel(toDateParam(range.to), locale)}`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-500">{t.calendarTitle}</h2>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 ${view === v ? "bg-white shadow-sm" : "text-neutral-500"}`}
            >
              {v === "day" ? t.calendarViewDay : v === "week" ? t.calendarViewWeek : t.calendarViewMonth}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={goPrev} aria-label={t.calendarPrevLabel} className="rounded-lg border border-neutral-300 px-2 py-1 text-sm">
            ‹
          </button>
          <button onClick={goNext} aria-label={t.calendarNextLabel} className="rounded-lg border border-neutral-300 px-2 py-1 text-sm">
            ›
          </button>
          <button onClick={goToday} className="ml-1 rounded-lg border border-neutral-300 px-2.5 py-1 text-sm">
            {t.calendarTodayButton}
          </button>
        </div>
        <span className="text-sm font-medium capitalize text-neutral-700">{title}</span>
      </div>

      {loadError && <p className="mb-2 text-sm text-red-600">{loadError}</p>}
      {dropError && <p className="mb-2 text-sm text-red-600">{dropError}</p>}

      {!loaded ? (
        <p className="text-sm text-neutral-500">{t.loading}</p>
      ) : view === "month" ? (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 text-xs">
          {t.weekdayLabels.map((label) => (
            <div key={label} className="bg-neutral-50 px-1 py-1 text-center font-medium text-neutral-500">
              {label}
            </div>
          ))}
          {dayStrs.map((dateStr) => {
            const dayEvents = eventsOnDay(events, dateStr);
            const inMonth = new Date(`${dateStr}T00:00:00Z`).getUTCMonth() === anchor.getMonth();
            const isToday = dateStr === toDateParam(new Date());
            return (
              <button
                key={dateStr}
                onClick={() => {
                  setAnchor(new Date(`${dateStr}T12:00:00Z`));
                  setView("day");
                }}
                className={`flex min-h-16 flex-col items-start gap-0.5 bg-white p-1 text-left ${inMonth ? "" : "opacity-40"}`}
              >
                <span className={`text-[11px] ${isToday ? "rounded-full bg-neutral-900 px-1.5 text-white" : "text-neutral-500"}`}>
                  {Number(dateStr.slice(8, 10))}
                </span>
                {dayEvents.slice(0, 2).map((e) => (
                  <span key={e.id} className="w-full truncate rounded bg-neutral-100 px-1 text-[10px]">
                    {timeToHhmm(businessHourMinute(e.start_at).hour, businessHourMinute(e.start_at).minute)}{" "}
                    {e.kind === "booking" ? e.client_name : e.reason ?? t.calendarBlockDetailsTitle}
                  </span>
                ))}
                {dayEvents.length > 2 && (
                  <span className="text-[10px] text-neutral-400">{t.calendarMoreEvents(dayEvents.length - 2)}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <div className="flex" style={{ minWidth: view === "week" ? 700 : undefined }}>
            <div className="w-12 shrink-0 border-r border-neutral-200">
              <div className="h-6 border-b border-neutral-100" />
              {Array.from({ length: gridBounds.endHour - gridBounds.startHour }).map((_, i) => (
                <div key={i} className="text-right text-[10px] text-neutral-400" style={{ height: 60 * PX_PER_MINUTE }}>
                  {pad2(gridBounds.startHour + i)}:00
                </div>
              ))}
            </div>
            <div className="flex flex-1">
              {dayStrs.map((dateStr) => (
                <div key={dateStr} className="flex flex-1 flex-col">
                  <div className="h-6 border-b border-neutral-100 text-center text-xs font-medium capitalize text-neutral-600">
                    {view === "week" ? weekdayHeaderLabel(dateStr, locale) : null}
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
