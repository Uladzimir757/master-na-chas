"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type Booking, type Provider, type Service, type Slot } from "@/lib/api";
import { addDays, dateKey, formatDayLabel, formatPriceRange, formatTime, toDateParam } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Card, Centered } from "@/components/ui";

const DAYS_AHEAD = 14;

interface Props {
  service: Service;
  providers: Provider[];
  showChangeService: boolean;
  onChangeService: () => void;
}

/** Everything here belongs to one chosen service. The parent mounts this
 * with `key={service.id}` — switching services throws this instance away
 * and mounts a fresh one, so there is nothing to manually reset when the
 * service changes: initial state already is empty. The only state resets
 * left in this file are inside event handlers (book-again, after a 409),
 * which is an ordinary setState call, not a synchronised effect. */
export default function SlotPicker({ service, providers, showChangeService, onChangeService }: Props) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  const loadAvailability = useCallback(async () => {
    setSlotsError(null);
    try {
      const today = new Date();
      const res = await api.getAvailability({
        service_id: service.id,
        date_from: toDateParam(today),
        date_to: toDateParam(addDays(today, DAYS_AHEAD)),
      });
      setSlots(res);
      // keep the day the visitor was looking at if it still has slots
      // (e.g. after a refresh post-conflict); otherwise fall back to the
      // first day that has any.
      setSelectedDateKey((prev) => {
        if (prev && res.some((s) => dateKey(s.start_at) === prev)) return prev;
        return res.length > 0 ? dateKey(res[0].start_at) : null;
      });
    } catch {
      setSlotsError(t.slotsLoadError);
    }
  }, [service.id]);

  useEffect(() => {
    (async () => {
      await loadAvailability();
    })();
  }, [loadAvailability]);

  const providerName = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? t.defaultMasterName;
  }, [providers]);

  // null/0 = no separate line shown — see Provider.call_out_fee in
  // app/models.py. Per-provider (not per-service), so this only resolves
  // once a specific provider is known, i.e. once a slot is picked.
  const providerCallOutFee = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p.call_out_fee]));
    return (id: string) => map.get(id) ?? null;
  }, [providers]);

  const daysWithSlots = useMemo(() => {
    if (!slots) return [];
    const seen = new Map<string, string>(); // dateKey -> first ISO for that day (for label)
    for (const s of slots) {
      const k = dateKey(s.start_at);
      if (!seen.has(k)) seen.set(k, s.start_at);
    }
    return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const slotsForSelectedDay = useMemo(() => {
    if (!slots || !selectedDateKey) return [];
    return slots
      .filter((s) => dateKey(s.start_at) === selectedDateKey)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [slots, selectedDateKey]);

  async function submitBooking() {
    if (!selectedSlot || clientName.trim().length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api.createBooking({
        service_id: service.id,
        provider_id: selectedSlot.provider_id,
        start_at: selectedSlot.start_at,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
      });
      setBooking(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSubmitError(t.slotTakenError);
        setSelectedSlot(null);
        await loadAvailability(); // any failure here surfaces via slotsError — no more silent catch
      } else {
        setSubmitError(t.genericSubmitError);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function bookAgain() {
    setBooking(null);
    setSelectedSlot(null);
    setClientName("");
    setClientPhone("");
    setSubmitError(null);
    loadAvailability();
  }

  if (booking) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">✓</div>
          <h1 className="text-xl font-semibold">{t.bookingCreatedTitle}</h1>
          <p className="text-neutral-600">
            {service.name} · {providerName(booking.provider_id)}
            <br />
            {formatDayLabel(booking.start_at)}, {formatTime(booking.start_at)}
          </p>
          <p className="text-sm text-neutral-500">
            {booking.status === "pending" ? t.bookingPending : t.bookingConfirmed}
          </p>
          <button className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-white" onClick={bookAgain}>
            {t.bookAgain}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {showChangeService && (
        <button className="mb-3 text-sm text-neutral-500 hover:text-neutral-900" onClick={onChangeService}>
          {t.changeService}
        </button>
      )}
      <h1 className="mb-1 text-xl font-semibold">{service.name}</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {t.durationMinutes(service.duration_minutes)}
        {formatPriceRange(service.price_min, service.price_max)
          ? ` · ${formatPriceRange(service.price_min, service.price_max)}`
          : ""}
      </p>

      {slotsError && <Centered>{slotsError}</Centered>}

      {!slotsError && slots === null && <Centered>{t.slotsLoading}</Centered>}

      {!slotsError && slots !== null && daysWithSlots.length === 0 && (
        <Centered>{t.noSlotsInRange(DAYS_AHEAD)}</Centered>
      )}

      {!slotsError && daysWithSlots.length > 0 && (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {daysWithSlots.map(([key, iso]) => (
              <button
                key={key}
                className={`shrink-0 rounded-full px-4 py-2 text-sm whitespace-nowrap ${
                  key === selectedDateKey ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
                }`}
                onClick={() => setSelectedDateKey(key)}
              >
                {formatDayLabel(iso)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slotsForSelectedDay.map((s) => (
              <button
                key={`${s.provider_id}-${s.start_at}`}
                className={`rounded-lg border px-2 py-2.5 text-sm ${
                  selectedSlot?.start_at === s.start_at && selectedSlot?.provider_id === s.provider_id
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 hover:border-neutral-400"
                }`}
                onClick={() => setSelectedSlot(s)}
              >
                <div className="font-medium">{formatTime(s.start_at)}</div>
                <div className="truncate text-xs opacity-70">{providerName(s.provider_id)}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Not nested inside `selectedSlot &&` below: the 409 handler in
          submitBooking() clears selectedSlot in the same breath it sets this,
          so the message would never actually render if it were. */}
      {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}

      {selectedSlot && (
        <div className="mt-5 border-t border-neutral-200 pt-4">
          <p className="mb-3 text-sm text-neutral-600">
            {formatDayLabel(selectedSlot.start_at)}, {formatTime(selectedSlot.start_at)} ·{" "}
            {providerName(selectedSlot.provider_id)}
            {providerCallOutFee(selectedSlot.provider_id) ? (
              <span className="text-neutral-500"> · {t.callOutFeeLine(providerCallOutFee(selectedSlot.provider_id)!)}</span>
            ) : null}
          </p>
          <div className="flex flex-col gap-2">
            <input
              className="rounded-lg border border-neutral-200 px-3 py-2.5"
              placeholder={t.namePlaceholder}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <input
              className="rounded-lg border border-neutral-200 px-3 py-2.5"
              placeholder={t.phonePlaceholder}
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
            />
            <button
              disabled={clientName.trim().length === 0 || submitting}
              className="mt-1 rounded-lg bg-neutral-900 px-5 py-2.5 text-white disabled:opacity-40"
              onClick={submitBooking}
            >
              {submitting ? t.submitting : t.submitBooking}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
