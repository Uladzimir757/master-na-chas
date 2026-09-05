"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Booking, type BookingStatus, type ProviderSettings, type Service } from "@/lib/api";
import { formatDayLabel, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Card, Centered } from "@/components/ui";

export default function CabinetDashboard({ onLogout }: { onLogout: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // /api/bookings and /api/providers/me are both scoped to whichever master
  // the session cookie identifies — nothing here ever asks for a specific
  // provider_id (see app/main.py's _get_own_provider).
  const loadAll = useCallback(async () => {
    try {
      const [s, b, svc] = await Promise.all([api.getMySettings(), api.listMyBookings(), api.listServices()]);
      setSettings(s);
      setBookings(b);
      setServices(svc);
      setLoaded(true);
    } catch {
      setLoadError(t.cabinetLoadError);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadAll();
    })();
  }, [loadAll]);

  const handleToggleConfirmation = useCallback(async () => {
    if (!settings) return;
    setSettingsError(null);
    setSavingSettings(true);
    try {
      const updated = await api.updateMySettings({
        requires_booking_confirmation: !settings.requires_booking_confirmation,
      });
      setSettings(updated);
    } catch {
      setSettingsError(t.settingsSaveError);
    } finally {
      setSavingSettings(false);
    }
  }, [settings]);

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
  }, []);

  if (loadError) {
    return <Centered>{loadError}</Centered>;
  }

  if (!loaded || !settings) {
    return <Centered>{t.cabinetLoading}</Centered>;
  }

  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? "";

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
        {settingsError && <p className="mt-2 text-sm text-red-600">{settingsError}</p>}
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
                      {formatDayLabel(b.start_at)}, {formatTime(b.start_at)}
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
