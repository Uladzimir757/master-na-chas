"use client";

/**
 * "Мои рабочие часы" — a master's own weekly schedule template plus per-date
 * overrides. Both underlying tables (WorkingHours, WorkingHoursException)
 * already drove app/slot_engine.py's availability computation; this is the
 * first time a master can edit either one himself instead of only via a
 * seed script / hand-written SQL. Self-contained (own load + own mutations,
 * not routed through CabinetDashboard.tsx's loadAll) — same shape as
 * lib/useLocationSharing.ts being its own concern rather than folded into
 * the parent's state, just as a component here instead of a hook, since
 * this needs its own fairly involved local editing state (the weekly grid).
 *
 * Weekly template: explicit "Save" button, not per-field blur-save like
 * settings/services elsewhere in the cabinet — a multi-row, multi-day grid
 * is one coherent edit, not a series of independent single values, so one
 * explicit save avoids firing a replace-semantics PUT after every keystroke
 * across seven days' worth of inputs.
 *
 * Exceptions: upsert-by-date (same PUT either creates or overwrites), so the
 * add form doubles as "add" and "replace" — no separate edit mode.
 */

import { useCallback, useEffect, useState } from "react";
import { api, type WorkingHoursException, type WorkingHoursSlot } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { toIntlTag, type LocaleCode } from "@/lib/locale";

type EditableSlot = WorkingHoursSlot & { localId: string };

function newLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withLocalIds(slots: WorkingHoursSlot[]): EditableSlot[] {
  return slots.map((s) => ({ ...s, localId: newLocalId() }));
}

// "YYYY-MM-DD" -> a locale-formatted weekday+date label. Deliberately not
// lib/format.ts's formatDayLabel: that one special-cases "today"/"tomorrow"
// off an ISO *datetime* in a fixed business timezone, which risks an
// off-by-one calendar day here if applied to a bare date string — parsing
// and re-formatting both in UTC keeps the shown date always matching the
// string itself, regardless of the visitor's own offset.
function formatExceptionDate(dateStr: string, locale: LocaleCode): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat(toIntlTag(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

// Local calendar date of whoever's looking at the cabinet — used as the
// add-exception form's date input `min` and initial value. Not the real
// source of truth for "upcoming" (that's the backend's BUSINESS_TZ, see
// app/main.py's _working_hours_out), just a sensible default/floor for the
// picker.
function todayDateParam(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WorkingHoursEditor() {
  const { locale, t } = useLocale();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<EditableSlot[]>([]);
  const [exceptions, setExceptions] = useState<WorkingHoursException[]>([]);

  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const [exceptionDate, setExceptionDate] = useState(todayDateParam());
  const [exceptionMode, setExceptionMode] = useState<"off" | "custom">("off");
  const [exceptionStart, setExceptionStart] = useState("09:00");
  const [exceptionEnd, setExceptionEnd] = useState("18:00");
  const [exceptionReason, setExceptionReason] = useState("");
  const [savingException, setSavingException] = useState(false);
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getMyWorkingHours();
      setSlots(withLocalIds(data.slots));
      setExceptions(data.exceptions);
      setLoaded(true);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      setLoadError(t.workingHoursLoadError);
    }
    // t.workingHoursLoadError only ever changes with locale, and re-fetching
    // on every translation-object identity change would refire this needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Same IIFE shape as CabinetDashboard.tsx's own load-on-mount effect
    // (not `void load()` directly) — matches the existing convention and
    // keeps eslint-plugin-react-hooks's set-state-in-effect check happy.
    (async () => {
      await load();
    })();
  }, [load]);

  const addInterval = useCallback((weekday: number) => {
    setSlots((prev) => [...prev, { localId: newLocalId(), weekday, start_time: "09:00", end_time: "18:00" }]);
  }, []);

  const removeInterval = useCallback((localId: string) => {
    setSlots((prev) => prev.filter((s) => s.localId !== localId));
  }, []);

  const updateInterval = useCallback(
    (localId: string, patch: Partial<Pick<EditableSlot, "start_time" | "end_time">>) => {
      setSlots((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
    },
    [],
  );

  const handleSaveTemplate = useCallback(async () => {
    setTemplateError(null);
    setSavingTemplate(true);
    try {
      const payload = slots.map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time }));
      const updated = await api.updateMyWorkingHours(payload);
      setSlots(withLocalIds(updated.slots));
    } catch {
      setTemplateError(t.workingHoursSaveError);
    } finally {
      setSavingTemplate(false);
    }
  }, [slots, t]);

  const handleAddException = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setExceptionError(null);
      setSavingException(true);
      try {
        const updated = await api.upsertWorkingHoursException(exceptionDate, {
          is_available: exceptionMode === "custom",
          start_time: exceptionMode === "custom" ? exceptionStart : null,
          end_time: exceptionMode === "custom" ? exceptionEnd : null,
          reason: exceptionReason.trim() === "" ? null : exceptionReason.trim(),
        });
        setExceptions((prev) => {
          const rest = prev.filter((ex) => ex.date !== updated.date);
          return [...rest, updated].sort((a, b) => a.date.localeCompare(b.date));
        });
        setExceptionReason("");
      } catch {
        setExceptionError(t.workingHoursExceptionSaveError);
      } finally {
        setSavingException(false);
      }
    },
    [exceptionDate, exceptionMode, exceptionStart, exceptionEnd, exceptionReason, t],
  );

  const handleDeleteException = useCallback(
    async (date: string) => {
      setDeleteError(null);
      setDeletingDate(date);
      try {
        await api.deleteWorkingHoursException(date);
        setExceptions((prev) => prev.filter((ex) => ex.date !== date));
      } catch {
        setDeleteError(t.workingHoursExceptionDeleteError);
      } finally {
        setDeletingDate(null);
      }
    },
    [t],
  );

  if (loadError) {
    return (
      <section className="mb-6 border-b border-neutral-200 pb-5">
        <h2 className="mb-2 text-sm font-medium text-neutral-500">{t.workingHoursTitle}</h2>
        <p className="text-sm text-red-600">{loadError}</p>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section className="mb-6 border-b border-neutral-200 pb-5">
        <h2 className="mb-2 text-sm font-medium text-neutral-500">{t.workingHoursTitle}</h2>
        <p className="text-sm text-neutral-500">{t.loading}</p>
      </section>
    );
  }

  return (
    <section className="mb-6 border-b border-neutral-200 pb-5">
      <h2 className="mb-1 text-sm font-medium text-neutral-500">{t.workingHoursTitle}</h2>
      <p className="mb-3 text-sm text-neutral-500">{t.workingHoursHint}</p>

      <ul className="flex flex-col gap-3">
        {t.weekdayLabels.map((label, weekday) => {
          const dayIntervals = slots.filter((s) => s.weekday === weekday);
          return (
            <li key={weekday} className="rounded-lg border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{label}</span>
                {dayIntervals.length === 0 && (
                  <span className="text-sm text-neutral-500">{t.workingHoursDayOff}</span>
                )}
              </div>

              {dayIntervals.length > 0 && (
                <div className="flex flex-col gap-2">
                  {dayIntervals.map((slot) => (
                    <div key={slot.localId} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-neutral-500">{t.workingHoursFromLabel}</span>
                      <input
                        type="time"
                        value={slot.start_time.slice(0, 5)}
                        onChange={(e) => updateInterval(slot.localId, { start_time: e.target.value })}
                        className="rounded-lg border border-neutral-300 px-2 py-1"
                      />
                      <span className="text-neutral-500">{t.workingHoursToLabel}</span>
                      <input
                        type="time"
                        value={slot.end_time.slice(0, 5)}
                        onChange={(e) => updateInterval(slot.localId, { end_time: e.target.value })}
                        className="rounded-lg border border-neutral-300 px-2 py-1"
                      />
                      <button
                        type="button"
                        aria-label={t.workingHoursRemoveIntervalLabel}
                        onClick={() => removeInterval(slot.localId)}
                        className="ml-1 text-neutral-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => addInterval(weekday)}
                className="mt-2 text-sm text-neutral-500 hover:text-neutral-800"
              >
                {t.workingHoursAddIntervalButton}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-neutral-400">{t.workingHoursValidationHint}</p>
      {templateError && <p className="mt-2 text-sm text-red-600">{templateError}</p>}
      <button
        type="button"
        disabled={savingTemplate}
        onClick={handleSaveTemplate}
        className="mt-3 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        {savingTemplate ? t.workingHoursSaving : t.workingHoursSaveButton}
      </button>

      <div className="mt-6 border-t border-neutral-200 pt-5">
        <h3 className="mb-1 text-sm font-medium text-neutral-500">{t.workingHoursExceptionsTitle}</h3>
        <p className="mb-3 text-sm text-neutral-500">{t.workingHoursExceptionsHint}</p>

        {deleteError && <p className="mb-2 text-sm text-red-600">{deleteError}</p>}

        {exceptions.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-500">{t.workingHoursNoExceptions}</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {exceptions.map((ex) => (
              <li
                key={ex.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
              >
                <div>
                  <div className="font-medium">{formatExceptionDate(ex.date, locale)}</div>
                  <div className="text-sm text-neutral-500">
                    {ex.is_available && ex.start_time && ex.end_time
                      ? `${ex.start_time.slice(0, 5)}–${ex.end_time.slice(0, 5)}`
                      : t.workingHoursExceptionDayOffLabel}
                  </div>
                  {ex.reason && (
                    <div className="text-sm text-neutral-500">
                      {t.workingHoursReasonLabel}: {ex.reason}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={deletingDate === ex.date}
                  onClick={() => handleDeleteException(ex.date)}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {t.workingHoursDeleteExceptionLabel}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={handleAddException}
          className="flex max-w-sm flex-col gap-3 rounded-lg border border-neutral-200 p-3"
        >
          <h4 className="text-sm font-medium">{t.workingHoursAddExceptionTitle}</h4>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-500">{t.workingHoursExceptionDateLabel}</span>
            <input
              type="date"
              required
              min={todayDateParam()}
              value={exceptionDate}
              onChange={(e) => setExceptionDate(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExceptionMode("off")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                exceptionMode === "off" ? "bg-neutral-900 text-white" : "border border-neutral-300"
              }`}
            >
              {t.workingHoursExceptionDayOffOption}
            </button>
            <button
              type="button"
              onClick={() => setExceptionMode("custom")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                exceptionMode === "custom" ? "bg-neutral-900 text-white" : "border border-neutral-300"
              }`}
            >
              {t.workingHoursExceptionCustomHoursOption}
            </button>
          </div>

          {exceptionMode === "custom" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-500">{t.workingHoursFromLabel}</span>
              <input
                type="time"
                required
                value={exceptionStart}
                onChange={(e) => setExceptionStart(e.target.value)}
                className="rounded-lg border border-neutral-300 px-2 py-1"
              />
              <span className="text-neutral-500">{t.workingHoursToLabel}</span>
              <input
                type="time"
                required
                value={exceptionEnd}
                onChange={(e) => setExceptionEnd(e.target.value)}
                className="rounded-lg border border-neutral-300 px-2 py-1"
              />
            </div>
          )}

          <input
            type="text"
            maxLength={200}
            placeholder={t.workingHoursExceptionReasonPlaceholder}
            value={exceptionReason}
            onChange={(e) => setExceptionReason(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          />

          {exceptionError && <p className="text-sm text-red-600">{exceptionError}</p>}

          <button
            type="submit"
            disabled={savingException}
            className="self-start rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            {savingException ? t.workingHoursSavingException : t.workingHoursAddExceptionButton}
          </button>
        </form>
      </div>
    </section>
  );
}
