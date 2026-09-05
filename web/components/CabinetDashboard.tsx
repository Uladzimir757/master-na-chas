"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Booking, type BookingStatus, type ProviderSettings, type ServiceToggle } from "@/lib/api";
import { formatDayLabel, formatTime } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import { Card, Centered } from "@/components/ui";

export default function CabinetDashboard({ onLogout }: { onLogout: () => void }) {
  const { locale, t, ready } = useLocale();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  // Doubles as the "which services exist" catalog for the bookings list's
  // serviceName() lookup below — GET /api/providers/me/services already
  // returns every active tenant service (each tagged with is_offered for
  // this provider), so a separate api.listServices() call would just be
  // fetching the same rows a second time.
  const [serviceToggles, setServiceToggles] = useState<ServiceToggle[]>([]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [savingServices, setSavingServices] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const feeInputRef = useRef<HTMLInputElement>(null);

  // /api/bookings, /api/providers/me and /api/providers/me/services are all
  // scoped to whichever master the session cookie identifies — nothing here
  // ever asks for a specific provider_id (see app/main.py's _get_own_provider).
  const loadAll = useCallback(async () => {
    try {
      const [s, b, svc] = await Promise.all([api.getMySettings(), api.listMyBookings(), api.getMyServices(locale)]);
      setSettings(s);
      setBookings(b);
      setServiceToggles(svc);
      setLoaded(true);
    } catch {
      setLoadError(t.cabinetLoadError);
    }
    // t is derived from `locale` and would otherwise re-run this on every
    // translation-object identity change; `locale` alone covers the real
    // trigger (service names are resolved server-side per lang).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      await loadAll();
    })();
  }, [loadAll, ready]);

  const handleToggleConfirmation = useCallback(async () => {
    if (!settings) return;
    setSettingsError(null);
    setSavingSettings(true);
    try {
      const updated = await api.updateMySettings({
        requires_booking_confirmation: !settings.requires_booking_confirmation,
        call_out_fee: settings.call_out_fee,
      });
      setSettings(updated);
    } catch {
      setSettingsError(t.settingsSaveError);
    } finally {
      setSavingSettings(false);
    }
  }, [settings, t]);

  // Uncontrolled input (key={settings.call_out_fee} below forces a remount
  // whenever the saved value actually changes, e.g. after a save) — same
  // key-based-remount convention this codebase already uses elsewhere
  // instead of syncing a prop into local state via an effect. Saves once on
  // blur, not per keystroke.
  const handleFeeBlur = useCallback(async () => {
    if (!settings || !feeInputRef.current) return;
    const raw = feeInputRef.current.value.trim();
    const parsed = raw === "" ? null : Number(raw);
    const nextFee = parsed !== null && Number.isNaN(parsed) ? null : parsed;
    if (nextFee === settings.call_out_fee) return;
    setSettingsError(null);
    setSavingSettings(true);
    try {
      const updated = await api.updateMySettings({
        requires_booking_confirmation: settings.requires_booking_confirmation,
        call_out_fee: nextFee,
      });
      setSettings(updated);
    } catch {
      setSettingsError(t.settingsSaveError);
    } finally {
      setSavingSettings(false);
    }
  }, [settings, t]);

  const handleToggleService = useCallback(
    async (serviceId: string) => {
      setServicesError(null);
      setSavingServices(true);
      const nextOffered = new Set(serviceToggles.filter((s) => s.is_offered).map((s) => s.service_id));
      if (nextOffered.has(serviceId)) {
        nextOffered.delete(serviceId);
      } else {
        nextOffered.add(serviceId);
      }
      try {
        const updated = await api.updateMyServices([...nextOffered], locale);
        setServiceToggles(updated);
      } catch {
        setServicesError(t.servicesSaveError);
      } finally {
        setSavingServices(false);
      }
    },
    [serviceToggles, locale, t],
  );

  const handleStatusChange = useCallback(async (bookingId: string, status: BookingStatus) => {
    setActionError(null);
    setActioningId(bookingId);
    try {
      const updated = await api.updateBookingStatus(bookingId, status);
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch {
      setActionError(t.bookingActionError);
    } finally {
      setActioningId(null);
    }
  }, [t]);

  if (!ready) {
    return <Centered>…</Centered>;
  }

  if (loadError) {
    return <Centered>{loadError}</Centered>;
  }

  if (!loaded || !settings) {
    return <Centered>{t.cabinetLoading}</Centered>;
  }

  const serviceName = (id: string) => serviceToggles.find((s) => s.service_id === id)?.name ?? "";

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.cabinetTitle(settings.name)}</h1>
        <button onClick={onLogout} className="text-sm text-neutral-500 hover:text-neutral-800">
          {t.logoutButton}
        </button>
      </div>

      <section className="mb-6 border-b border-neutral-200 pb-5">
        <h2 className="mb-2 text-sm font-medium text-neutral-500">{t.settingsTitle}</h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.requires_booking_confirmation}
            disabled={savingSettings}
            onChange={handleToggleConfirmation}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">{t.requiresConfirmationLabel}</span>
            <span className="block text-sm text-neutral-500">{t.requiresConfirmationHint}</span>
          </span>
        </label>

        <div className="mt-4">
          <label className="block">
            <span className="block font-medium">{t.callOutFeeLabel}</span>
            <span className="mt-1 block text-sm text-neutral-500">{t.callOutFeeHint}</span>
            <input
              key={settings.call_out_fee ?? "empty"}
              ref={feeInputRef}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={settings.call_out_fee ?? ""}
              placeholder={t.callOutFeePlaceholder}
              disabled={savingSettings}
              onBlur={handleFeeBlur}
              className="mt-2 w-32 rounded-lg border border-neutral-300 px-3 py-1.5"
            />
          </label>
        </div>

        {settingsError && <p className="mt-2 text-sm text-red-600">{settingsError}</p>}
      </section>

      <section className="mb-6 border-b border-neutral-200 pb-5">
        <h2 className="mb-1 text-sm font-medium text-neutral-500">{t.servicesOfferedTitle}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t.servicesOfferedHint}</p>
        {serviceToggles.length === 0 ? (
          <p className="text-sm text-neutral-500">{t.noActiveServices}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {serviceToggles.map((svc) => (
              <li key={svc.service_id}>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={svc.is_offered}
                    disabled={savingServices}
                    onChange={() => handleToggleService(svc.service_id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium">{svc.name}</span>
                    <span className="block text-sm text-neutral-500">{t.durationMinutes(svc.duration_minutes)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {servicesError && <p className="mt-2 text-sm text-red-600">{servicesError}</p>}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">{t.bookingsTitle}</h2>
        {actionError && <p className="mb-2 text-sm text-red-600">{actionError}</p>}
        {bookings.length === 0 ? (
          <p className="text-sm text-neutral-500">{t.noBookings}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bookings.map((b) => (
              <li key={b.id} className="rounded-lg border border-neutral-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{serviceName(b.service_id)}</div>
                    <div className="text-sm text-neutral-500">
                      {formatDayLabel(b.start_at, locale, t)}, {formatTime(b.start_at, locale)}
                    </div>
                    <div className="text-sm text-neutral-500">
                      {b.client_name}
                      {b.client_phone ? ` · ${b.client_phone}` : ""}
                    </div>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
                    {t.bookingStatusLabel[b.status] ?? b.status}
                  </span>
                </div>
                {(b.status === "pending" || b.status === "confirmed") && (
                  <div className="mt-2 flex gap-2">
                    {b.status === "pending" && (
                      <button
                        disabled={actioningId === b.id}
                        onClick={() => handleStatusChange(b.id, "confirmed")}
                        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                      >
                        {t.confirmBookingButton}
                      </button>
                    )}
                    <button
                      disabled={actioningId === b.id}
                      onClick={() => handleStatusChange(b.id, "cancelled")}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
                    >
                      {t.cancelBookingButton}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
