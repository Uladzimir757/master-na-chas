"use client";

/**
 * The calendar's five popovers — choosing what to do with an empty slot,
 * the manual-booking and block-time forms, an event's details, and its
 * "change time" sub-form. Split out of MasterCalendar.tsx (which grew to
 * ~1180 lines building all of these inline) purely for readability; none of
 * these are reused anywhere else.
 *
 * Styling pass (second round after the initial calendar build): every
 * control here now goes through the site's own `inputClass`/`CompactButton`
 * (components/ui.tsx) instead of one-off `rounded-lg border-neutral-300`
 * strings, so this matches the rest of the cabinet instead of looking like
 * a separate widget. Paired fields (start/end time, price min/max) stack on
 * narrow viewports (`flex-col sm:flex-row`) instead of a rigid `flex` row —
 * on a phone, two native <input type="time"> pickers side by side in a
 * ~350px-wide modal is exactly what was overflowing the box before.
 */

import { useMemo, useState } from "react";
import {
  api,
  ApiError,
  type BookingStatus,
  type ServiceToggle,
} from "@/lib/api";
import { businessHourMinute, dateKey, warsawIso } from "@/lib/format";
import type { Translations } from "@/lib/i18n";
import type { LocaleCode } from "@/lib/locale";
import { CompactButton, inputClass } from "@/components/ui";
import {
  type CalEvent,
  parseHhmm,
  statusClasses,
  timeToHhmm,
  weekdayHeaderLabel,
} from "./helpers";

// ----------------------------------------------------------------------------
// Shared modal shell.
// ----------------------------------------------------------------------------

export function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-md border border-line bg-bg p-4 shadow-lg sm:p-5"
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

export function ChooseActionModal({
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
      <h3 className="mb-1 text-sm font-medium text-ink">
        {t.calendarChooseActionTitle}
      </h3>
      <p className="mb-3 text-sm text-ink/60">
        {dateStr}, {time}
      </p>
      <div className="flex flex-col gap-2">
        <CompactButton onClick={onPickBooking}>
          {t.calendarAddBookingButton}
        </CompactButton>
        <CompactButton variant="secondary" onClick={onPickBlock}>
          {t.calendarBlockTimeButton}
        </CompactButton>
        <button
          onClick={onClose}
          className="mt-1 text-sm text-ink/60 hover:text-ink"
        >
          {t.calendarCloseButton}
        </button>
      </div>
    </Modal>
  );
}

export function ManualBookingForm({
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
  const offered = useMemo(
    () => services.filter((s) => s.is_offered),
    [services],
  );
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
        err instanceof ApiError && err.status === 409
          ? t.calendarConflictError
          : t.calendarCreateBookingError,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-3 text-sm font-medium text-ink">
        {t.calendarNewBookingTitle}
      </h3>
      {offered.length === 0 ? (
        <p className="text-sm text-ink/60">{t.noActiveServices}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t.calendarServiceLabel}
            <select
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className={inputClass}
            >
              {offered.map((s) => (
                <option key={s.service_id} value={s.service_id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              {t.calendarTimeLabel}
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              {t.calendarDurationLabel}
              <input
                type="number"
                min={5}
                step={5}
                required
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={inputClass}
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
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.calendarClientPhoneLabel}
            <input
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder={t.calendarClientPhonePlaceholder}
              className={inputClass}
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
              className={inputClass}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            <CompactButton type="submit" disabled={saving}>
              {saving
                ? t.calendarCreatingBooking
                : t.calendarCreateBookingButton}
            </CompactButton>
            <CompactButton type="button" variant="secondary" onClick={onClose}>
              {t.calendarCloseButton}
            </CompactButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function BlockForm({
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
        err instanceof ApiError && err.status === 409
          ? t.calendarConflictError
          : t.calendarCreateBlockError,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-3 text-sm font-medium text-ink">
        {t.calendarNewBlockTitle}
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {t.calendarTimeLabel}
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {t.calendarEndTimeLabel}
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
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
            className={inputClass}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="mt-1 flex flex-wrap gap-2">
          <CompactButton type="submit" disabled={saving}>
            {saving ? t.calendarCreatingBlock : t.calendarCreateBlockButton}
          </CompactButton>
          <CompactButton type="button" variant="secondary" onClick={onClose}>
            {t.calendarCloseButton}
          </CompactButton>
        </div>
      </form>
    </Modal>
  );
}

export function EventDetailsModal({
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
      <RescheduleTimeForm
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
          <h3 className="mb-1 text-sm font-medium text-ink">
            {serviceName(event.service_id)}
          </h3>
          <p className="mb-1 text-sm text-ink/60">
            {weekdayHeaderLabel(dateStr, locale)},{" "}
            {timeToHhmm(startHm.hour, startHm.minute)}–
            {timeToHhmm(endHm.hour, endHm.minute)}
          </p>
          <p className="mb-3 text-sm text-ink/60">
            {event.client_name}
            {event.client_phone ? ` · ${event.client_phone}` : ""}
          </p>
          <span
            className={`mb-3 inline-block rounded-full px-2.5 py-1 text-xs ${statusClasses(event.status)}`}
          >
            {t.bookingStatusLabel[event.status] ?? event.status}
          </span>
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {event.status === "pending" && (
              <CompactButton
                disabled={busy}
                onClick={() => handleStatus("confirmed")}
              >
                {t.confirmBookingButton}
              </CompactButton>
            )}
            {(event.status === "pending" || event.status === "confirmed") && (
              <CompactButton variant="secondary" disabled={busy} onClick={() => handleStatus("cancelled")}>
                {t.cancelBookingButton}
              </CompactButton>
            )}
            <CompactButton
              variant="secondary"
              disabled={busy}
              onClick={() => setEditingTime(true)}
            >
              {t.calendarEditTimeButton}
            </CompactButton>
            <button
              onClick={onClose}
              className="ml-auto text-sm text-ink/60 hover:text-ink"
            >
              {t.calendarCloseButton}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="mb-1 text-sm font-medium text-ink">
            {t.calendarBlockDetailsTitle}
          </h3>
          <p className="mb-1 text-sm text-ink/60">
            {weekdayHeaderLabel(dateStr, locale)},{" "}
            {timeToHhmm(startHm.hour, startHm.minute)}–
            {timeToHhmm(endHm.hour, endHm.minute)}
          </p>
          {event.reason && (
            <p className="mb-3 text-sm text-ink">{event.reason}</p>
          )}
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <CompactButton
              variant="secondary"
              disabled={busy}
              onClick={() => setEditingTime(true)}
            >
              {t.calendarEditTimeButton}
            </CompactButton>
            <CompactButton
              disabled={busy}
              onClick={handleDeleteBlock}
              className="!border-danger/50 !bg-transparent !text-danger hover:!bg-danger/10"
            >
              {busy ? t.calendarDeletingBlock : t.calendarDeleteBlockButton}
            </CompactButton>
            <button
              onClick={onClose}
              className="ml-auto text-sm text-ink/60 hover:text-ink"
            >
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
function RescheduleTimeForm({
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
  const [startTime, setStartTime] = useState(
    timeToHhmm(startHm.hour, startHm.minute),
  );
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
        await api.updateBlock(event.id, {
          start_at: startIso,
          end_at: endIso,
          reason: event.reason ?? undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t.calendarConflictError
          : t.calendarRescheduleError,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-3 text-sm font-medium text-ink">
        {t.calendarEditTimeButton}
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {t.calendarTimeLabel}
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {t.calendarEndTimeLabel}
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="mt-1 flex flex-wrap gap-2">
          <CompactButton type="submit" disabled={saving}>
            {saving ? t.calendarSavingTime : t.calendarSaveTimeButton}
          </CompactButton>
          <CompactButton type="button" variant="secondary" onClick={onClose}>
            {t.calendarCloseButton}
          </CompactButton>
        </div>
      </form>
    </Modal>
  );
}
