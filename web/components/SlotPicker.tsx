"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type Booking, type Provider, type Service, type Slot } from "@/lib/api";
import { addDays, dateKey, formatDayLabel, formatTime, toDateParam } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import type { Translations } from "@/lib/i18n";
import { Button, Card, Centered } from "@/components/ui";
import { PriceLabel } from "@/components/PriceLabel";
import ProviderMap from "@/components/ProviderMap";

// How often the "N мин назад" label under the map recomputes (Этап 4) — a
// plain render-time Date.now() would otherwise only update when something
// else re-renders this component, which could be a while once a slot is
// already selected and nothing else on the page is changing.
const LOCATION_LABEL_REFRESH_MS = 30_000;

function formatLocationAgo(updatedAtIso: string, t: Translations): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(updatedAtIso).getTime()) / 60_000));
  return minutes < 1 ? t.masterLocationJustNow : t.masterLocationMinutesAgo(minutes);
}

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
  const { locale, t } = useLocale();

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
  }, [service.id, t]);

  useEffect(() => {
    (async () => {
      await loadAvailability();
    })();
  }, [loadAvailability]);

  const providerName = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? t.defaultMasterName;
  }, [providers, t]);

  // null/0 = no separate line shown — see Provider.call_out_fee in
  // app/models.py. Per-provider (not per-service), so this only resolves
  // once a specific provider is known, i.e. once a slot is picked.
  const providerCallOutFee = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p.call_out_fee]));
    return (id: string) => map.get(id) ?? null;
  }, [providers]);

  // Этап 4 — null unless the backend has already applied all three publish
  // gates (share_location on, fix fresh, currently working hours — see
  // app/main.py's _resolve_provider_location). Same per-provider,
  // once-a-slot-is-picked shape as call_out_fee above.
  const providerLocation = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p.location]));
    return (id: string) => map.get(id) ?? null;
  }, [providers]);

  // Ticks every LOCATION_LABEL_REFRESH_MS purely to force the "N мин назад"
  // label (below) to recompute — nothing here reads `locationClock` itself.
  const [locationClock, setLocationClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLocationClock((n) => n + 1), LOCATION_LABEL_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

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
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-2/15 text-2xl text-accent-2">
            ✓
          </div>
          <h1 className="text-xl font-extrabold tracking-[-0.01em]">{t.bookingCreatedTitle}</h1>
          <p className="text-ink/70">
            {service.name} · {providerName(booking.provider_id)}
            <br />
            {formatDayLabel(booking.start_at, locale, t)}, <span className="font-mono">{formatTime(booking.start_at, locale)}</span>
          </p>
          <p className="text-sm text-ink/60">{booking.status === "pending" ? t.bookingPending : t.bookingConfirmed}</p>
          <Button className="mt-4" onClick={bookAgain}>
            {t.bookAgain}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {showChangeService && (
        <button className="mb-3 text-sm text-ink/50 hover:text-accent-2" onClick={onChangeService}>
          {t.changeService}
        </button>
      )}
      <h1 className="mb-1 text-xl font-extrabold tracking-[-0.01em]">{service.name}</h1>
      <p className="mb-4 text-sm text-ink/60">
        {t.durationMinutes(service.duration_minutes)}
        {service.price_min != null || service.price_max != null ? (
          <>
            {" · "}
            <PriceLabel min={service.price_min} max={service.price_max} t={t} />
          </>
        ) : null}
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
                className={`shrink-0 rounded-md border px-4 py-2 text-sm whitespace-nowrap ${
                  key === selectedDateKey
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-bg text-ink hover:border-accent-2"
                }`}
                onClick={() => setSelectedDateKey(key)}
              >
                {formatDayLabel(iso, locale, t)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slotsForSelectedDay.map((s) => {
              const isSelected = selectedSlot?.start_at === s.start_at && selectedSlot?.provider_id === s.provider_id;
              return (
                <button
                  key={`${s.provider_id}-${s.start_at}`}
                  className={`rounded-md border px-2 py-2 text-sm ${
                    isSelected ? "chip-settle border-accent bg-accent text-bg" : "border-line hover:border-accent-2"
                  }`}
                  onClick={() => setSelectedSlot(s)}
                >
                  <div className="font-mono font-medium">{formatTime(s.start_at, locale)}</div>
                  <div className="truncate text-xs opacity-70">{providerName(s.provider_id)}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Not nested inside `selectedSlot &&` below: the 409 handler in
          submitBooking() clears selectedSlot in the same breath it sets this,
          so the message would never actually render if it were. */}
      {submitError && <p className="mt-3 text-sm text-danger">{submitError}</p>}

      {selectedSlot && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-3 text-sm text-ink/70">
            {formatDayLabel(selectedSlot.start_at, locale, t)},{" "}
            <span className="font-mono">{formatTime(selectedSlot.start_at, locale)}</span> ·{" "}
            {providerName(selectedSlot.provider_id)}
            {providerCallOutFee(selectedSlot.provider_id) ? (
              <span className="text-ink/60"> · {t.callOutFeeLine(providerCallOutFee(selectedSlot.provider_id)!)}</span>
            ) : null}
          </p>

          {providerLocation(selectedSlot.provider_id) && (
            // key={locationClock}: the only reason this block re-renders on
            // its own (nothing else here changes every 30s) — see the
            // locationClock tick above.
            <div key={locationClock} className="mb-4">
              <p className="mb-1.5 text-sm font-medium">{t.masterLocationTitle}</p>
              <ProviderMap
                lat={providerLocation(selectedSlot.provider_id)!.lat}
                lng={providerLocation(selectedSlot.provider_id)!.lng}
              />
              <p className="mt-1 text-xs text-ink/60">
                {formatLocationAgo(providerLocation(selectedSlot.provider_id)!.updated_at, t)}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <input
              className="rounded-md border border-line px-4 py-2"
              placeholder={t.namePlaceholder}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <input
              className="rounded-md border border-line px-4 py-2"
              placeholder={t.phonePlaceholder}
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
            />
            <Button className="mt-1" disabled={clientName.trim().length === 0 || submitting} onClick={submitBooking}>
              {submitting ? t.submitting : t.submitBooking}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
