"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type ProviderSettings,
  type ServiceOffer,
  type ServiceToggle,
} from "@/lib/api";
import { formatTime } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import {
  useLocationSharing,
  type LocationSharingStatus,
} from "@/lib/useLocationSharing";
import type { Translations } from "@/lib/i18n";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import StaffManager from "@/components/StaffManager";
import {
  Card,
  Centered,
  CompactButton,
  inputClass,
  Tabs,
} from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import WorkingHoursEditor from "@/components/WorkingHoursEditor";
import MasterCalendar from "@/components/MasterCalendar";

type CabinetTab =
  "calendar" | "services" | "settings" | "analytics" | "team" | "password";

function locationStatusText(
  status: LocationSharingStatus,
  t: Translations,
): string | null {
  switch (status) {
    case "idle":
      return null;
    case "waiting":
      return t.locationSharingWaiting;
    case "active":
      return t.locationSharingActive;
    case "denied":
      return t.locationSharingDenied;
    case "unsupported":
      return t.locationSharingUnsupported;
    case "error":
      return t.locationSharingError;
  }
}

const TAB_PERMISSION: Record<string, string> = {
  calendar: "calendar_view",
  services: "services_edit",
  settings: "settings_edit",
  analytics: "analytics_view",
  team: "staff_manage",
};

// Запрошенная вкладка может быть недоступна сотруднику — тогда показываем
// первую доступную. Считается при рендере, а не эффектом с setState.
function effectiveTab(
  requested: CabinetTab,
  perms: string[] | null,
): CabinetTab {
  if (perms === null || requested === "password") return requested;
  const allowed = (k: CabinetTab) =>
    perms.includes(TAB_PERMISSION[k]) ||
    (k === "settings" && perms.includes("hours_edit"));
  if (allowed(requested)) return requested;
  return (
    (Object.keys(TAB_PERMISSION) as CabinetTab[]).find(allowed) ?? "password"
  );
}

export default function CabinetDashboard({
  onLogout,
}: {
  onLogout: () => void;
}) {
  const { locale, t, ready } = useLocale();

  const [requestedTab, setTab] = useState<CabinetTab>("calendar");
  // права текущего сотрудника (роль + чекбоксы) -> какие вкладки показывать;
  // сервер всё равно проверяет каждое действие (403), это только UI.
  const [perms, setPerms] = useState<string[] | null>(null);
  useEffect(() => {
    api
      .me()
      .then((m) => setPerms(m.permissions))
      .catch(() => setPerms([]));
  }, []);
  const can = (p: string) => perms === null || perms.includes(p);
  const tab = effectiveTab(requestedTab, perms);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
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

  const [savingBusy, setSavingBusy] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(
    null,
  );
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);

  const feeInputRef = useRef<HTMLInputElement>(null);
  const busyEstimateInputRef = useRef<HTMLInputElement>(null);

  // /api/bookings, /api/providers/me and /api/providers/me/services are all
  // scoped to whichever master the session cookie identifies — nothing here
  // ever asks for a specific provider_id (see app/main.py's _get_own_provider).
  const loadAll = useCallback(async () => {
    try {
      const [s, svc] = await Promise.all([
        api.getMySettings(),
        api.getMyServices(locale),
      ]);
      setSettings(s);
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
        share_location: settings.share_location,
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
        share_location: settings.share_location,
      });
      setSettings(updated);
    } catch {
      setSettingsError(t.settingsSaveError);
    } finally {
      setSavingSettings(false);
    }
  }, [settings, t]);

  // Этап 4 — live location dot. share_location only ever controls whether
  // useLocationSharing (below) is allowed to run; it does not itself send
  // any GPS data.
  const handleToggleShareLocation = useCallback(async () => {
    if (!settings) return;
    setSettingsError(null);
    setSavingSettings(true);
    try {
      const updated = await api.updateMySettings({
        requires_booking_confirmation: settings.requires_booking_confirmation,
        call_out_fee: settings.call_out_fee,
        share_location: !settings.share_location,
      });
      setSettings(updated);
    } catch {
      setSettingsError(t.settingsSaveError);
    } finally {
      setSavingSettings(false);
    }
  }, [settings, t]);

  // Shared by the toggle checkbox and the price/description fields below —
  // PUT /api/providers/me/services is replace-semantics (see api.ts), so
  // every save resends the FULL set of currently-offered services with
  // their own price/description, not just the one field that changed.
  const saveServiceOffers = useCallback(
    async (offers: ServiceOffer[]) => {
      setServicesError(null);
      setSavingServices(true);
      try {
        const updated = await api.updateMyServices(offers, locale);
        setServiceToggles(updated);
      } catch {
        setServicesError(t.servicesSaveError);
      } finally {
        setSavingServices(false);
      }
    },
    [locale, t],
  );

  const handleToggleService = useCallback(
    (serviceId: string) => {
      const nextOffered = new Set(
        serviceToggles.filter((s) => s.is_offered).map((s) => s.service_id),
      );
      if (nextOffered.has(serviceId)) {
        nextOffered.delete(serviceId);
      } else {
        nextOffered.add(serviceId);
      }
      const offers = serviceToggles
        .filter((s) => nextOffered.has(s.service_id))
        .map((s) => ({ service_id: s.service_id, price_min: s.price_min, price_max: s.price_max, description: s.description }));
      void saveServiceOffers(offers);
    },
    [serviceToggles, saveServiceOffers],
  );

  // One entry point for editing a single offered service's own price/
  // description — carries every other offered service through unchanged
  // and applies `patch` to just `serviceId`, matching the replace-semantics
  // PUT above. Only ever called for a service that's currently offered
  // (the fields aren't rendered otherwise), so it's always in the array.
  const applyServiceFieldEdit = useCallback(
    (serviceId: string, patch: Partial<Pick<ServiceToggle, "price_min" | "price_max" | "description">>) => {
      const offers = serviceToggles
        .filter((s) => s.is_offered)
        .map((s) => ({
          service_id: s.service_id,
          price_min: s.price_min,
          price_max: s.price_max,
          description: s.description,
          ...(s.service_id === serviceId ? patch : {}),
        }));
      void saveServiceOffers(offers);
    },
    [serviceToggles, saveServiceOffers],
  );

  // Uncontrolled fields (key'd by the saved value, same convention as
  // handleFeeBlur above) — save once on blur, not per keystroke.
  const handleServicePriceMinBlur = useCallback(
    (serviceId: string, raw: string) => {
      const current = serviceToggles.find((s) => s.service_id === serviceId);
      if (!current) return;
      const trimmed = raw.trim();
      const parsed = trimmed === "" ? null : Number(trimmed);
      const nextValue = parsed !== null && Number.isNaN(parsed) ? null : parsed;
      if (nextValue === current.price_min) return;
      applyServiceFieldEdit(serviceId, { price_min: nextValue });
    },
    [serviceToggles, applyServiceFieldEdit],
  );

  const handleServicePriceMaxBlur = useCallback(
    (serviceId: string, raw: string) => {
      const current = serviceToggles.find((s) => s.service_id === serviceId);
      if (!current) return;
      const trimmed = raw.trim();
      const parsed = trimmed === "" ? null : Number(trimmed);
      const nextValue = parsed !== null && Number.isNaN(parsed) ? null : parsed;
      if (nextValue === current.price_max) return;
      applyServiceFieldEdit(serviceId, { price_max: nextValue });
    },
    [serviceToggles, applyServiceFieldEdit],
  );

  const handleServiceDescriptionBlur = useCallback(
    (serviceId: string, raw: string) => {
      const current = serviceToggles.find((s) => s.service_id === serviceId);
      if (!current) return;
      const trimmed = raw.trim();
      const nextValue = trimmed === "" ? null : trimmed;
      if (nextValue === current.description) return;
      applyServiceFieldEdit(serviceId, { description: nextValue });
    },
    [serviceToggles, applyServiceFieldEdit],
  );

  // "Занят сейчас" — a general override independent of any specific
  // booking (docs discussion: covers off-app jobs too, not just this
  // site's own bookings). All three calls return the same busy_started_at/
  // busy_estimated_minutes/busy_until trio that also lives on `settings`,
  // so merging the response over the existing settings object keeps every
  // other field (fee, confirmation requirement, ...) untouched.
  const handleStartBusy = useCallback(async () => {
    if (!settings) return;
    setBusyError(null);
    setSavingBusy(true);
    try {
      const updated = await api.startBusy();
      setSettings({ ...settings, ...updated });
    } catch {
      setBusyError(t.busyActionError);
    } finally {
      setSavingBusy(false);
    }
  }, [settings, t]);

  const handleFinishBusy = useCallback(async () => {
    if (!settings) return;
    setBusyError(null);
    setSavingBusy(true);
    try {
      const updated = await api.finishBusy();
      setSettings({ ...settings, ...updated });
    } catch {
      setBusyError(t.busyActionError);
    } finally {
      setSavingBusy(false);
    }
  }, [settings, t]);

  // Same uncontrolled-input-plus-key-remount convention as handleFeeBlur
  // above: saves once on blur, not per keystroke. An empty field clears the
  // estimate back to open-ended (null), matching the backend's
  // always-send-the-full-value PATCH shape.
  const handleBusyEstimateBlur = useCallback(async () => {
    if (!settings || !busyEstimateInputRef.current) return;
    const raw = busyEstimateInputRef.current.value.trim();
    const parsed = raw === "" ? null : Math.round(Number(raw));
    const nextEstimate =
      parsed !== null && Number.isNaN(parsed) ? null : parsed;
    if (nextEstimate === settings.busy_estimated_minutes) return;
    setBusyError(null);
    setSavingBusy(true);
    try {
      const updated = await api.updateBusyEstimate(nextEstimate);
      setSettings({ ...settings, ...updated });
    } catch {
      setBusyError(t.busyActionError);
    } finally {
      setSavingBusy(false);
    }
  }, [settings, t]);

  // Master changing their own password (previously only the superadmin
  // could ever set one, at creation time). Validated client-side first
  // (match + minimum length) so a typo never even reaches the network —
  // the backend re-validates the length anyway (defense-in-depth, same
  // shape as everywhere else in this codebase), but there's no reason to
  // round-trip for a check we can already do here.
  const handleChangePassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setChangePasswordError(null);
      setChangePasswordSuccess(false);
      if (newPassword.length < 8) {
        setChangePasswordError(t.changePasswordTooShortError);
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setChangePasswordError(t.changePasswordMismatchError);
        return;
      }
      setChangingPassword(true);
      try {
        await api.changePassword(currentPassword, newPassword);
        setChangePasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } catch (err) {
        setChangePasswordError(
          err instanceof ApiError && err.status === 401
            ? t.changePasswordWrongCurrentError
            : t.changePasswordGenericError,
        );
      } finally {
        setChangingPassword(false);
      }
    },
    [currentPassword, newPassword, confirmNewPassword, t],
  );

  // Этап 4 — only ever watches/sends GPS while settings.share_location is
  // on (see lib/useLocationSharing.ts's own docstring for why this is
  // foreground-only). Called unconditionally (Rules of Hooks) even before
  // `settings` has loaded — `?? false` just means "not sharing yet".
  const locationStatus = useLocationSharing(settings?.share_location ?? false);

  if (!ready) {
    return <Centered>…</Centered>;
  }

  if (loadError) {
    return <Centered>{loadError}</Centered>;
  }

  if (!loaded || !settings) {
    return <Centered>{t.cabinetLoading}</Centered>;
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {t.cabinetTitle(settings.name)}
        </h1>
        <button
          onClick={onLogout}
          className="text-sm text-ink/60 hover:text-ink"
        >
          {t.logoutButton}
        </button>
      </div>

      <Tabs
        tabs={[
          ...(can("calendar_view")
            ? [{ id: "calendar" as const, label: t.calendarTitle }]
            : []),
          ...(can("services_edit")
            ? [{ id: "services" as const, label: t.servicesOfferedTitle }]
            : []),
          ...(can("settings_edit") || can("hours_edit")
            ? [{ id: "settings" as const, label: t.settingsTitle }]
            : []),
          ...(can("analytics_view")
            ? [{ id: "analytics" as const, label: t.tabAnalytics }]
            : []),
          ...(can("staff_manage")
            ? [{ id: "team" as const, label: t.tabTeam }]
            : []),
          { id: "password" as const, label: t.changePasswordTitle },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "calendar" && <MasterCalendar />}
      {tab === "analytics" && <AnalyticsPanel />}
      {tab === "team" && <StaffManager />}

      {tab === "services" && (
        <section>
          <p className="mb-3 text-sm text-ink/60">{t.servicesOfferedHint}</p>
          {serviceToggles.length === 0 ? (
            <p className="text-sm text-ink/60">{t.noActiveServices}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {serviceToggles.map((svc) => (
                <li
                  key={svc.service_id}
                  className="rounded-md border border-line p-3"
                >
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
                      <span className="block text-sm text-ink/60">{t.durationMinutes(svc.duration_minutes)}</span>
                    </span>
                  </label>

                  {svc.is_offered && (
                    <div className="mt-3 flex flex-col gap-2 pl-7">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          key={`${svc.service_id}-min-${svc.price_min ?? "empty"}`}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          defaultValue={svc.price_min ?? ""}
                          placeholder={t.servicePriceMinPlaceholder}
                          disabled={savingServices}
                          onBlur={(e) =>
                            handleServicePriceMinBlur(
                              svc.service_id,
                              e.target.value,
                            )
                          }
                          className={`sm:w-32 ${inputClass}`}
                        />
                        <input
                          key={`${svc.service_id}-max-${svc.price_max ?? "empty"}`}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          defaultValue={svc.price_max ?? ""}
                          placeholder={t.servicePriceMaxPlaceholder}
                          disabled={savingServices}
                          onBlur={(e) =>
                            handleServicePriceMaxBlur(
                              svc.service_id,
                              e.target.value,
                            )
                          }
                          className={`sm:w-32 ${inputClass}`}
                        />
                      </div>
                      <input
                        key={`${svc.service_id}-desc-${svc.description ?? "empty"}`}
                        type="text"
                        maxLength={2000}
                        defaultValue={svc.description ?? ""}
                        placeholder={t.serviceDescriptionPlaceholder}
                        disabled={savingServices}
                        onBlur={(e) =>
                          handleServiceDescriptionBlur(
                            svc.service_id,
                            e.target.value,
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {servicesError && (
            <p className="mt-2 text-sm text-danger">{servicesError}</p>
          )}
        </section>
      )}

      {tab === "settings" && (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-sm font-medium text-ink/60">
              {t.busyTitle}
            </h2>
            {settings.busy_started_at ? (
              <div>
                <p className="font-medium">
                  {t.busyStatusSince(
                    formatTime(settings.busy_started_at, locale),
                  )}
                </p>
                {settings.busy_until ? (
                  <p className="text-sm text-ink/60">
                    {t.busyUntilText(formatTime(settings.busy_until, locale))}
                  </p>
                ) : (
                  <p className="text-sm text-ink/60">{t.busyOpenEndedNote}</p>
                )}

                <div className="mt-3">
                  <label className="block">
                    <span className="block font-medium">
                      {t.busyEstimateLabel}
                    </span>
                    <span className="mt-1 block text-sm text-ink/60">
                      {t.busyEstimateHint}
                    </span>
                    <input
                      key={settings.busy_estimated_minutes ?? "empty"}
                      ref={busyEstimateInputRef}
                      type="number"
                      min={1}
                      step="1"
                      inputMode="numeric"
                      defaultValue={settings.busy_estimated_minutes ?? ""}
                      placeholder={t.busyEstimatePlaceholder}
                      disabled={savingBusy}
                      onBlur={handleBusyEstimateBlur}
                      className={`mt-2 w-32 ${inputClass}`}
                    />
                  </label>
                </div>

                <CompactButton
                  disabled={savingBusy}
                  onClick={handleFinishBusy}
                  className="mt-3"
                >
                  {t.finishBusyButton}
                </CompactButton>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-sm text-ink/60">{t.busyHint}</p>
                <CompactButton disabled={savingBusy} onClick={handleStartBusy}>
                  {t.startBusyButton}
                </CompactButton>
              </div>
            )}
            {busyError && (
              <p className="mt-2 text-sm text-danger">{busyError}</p>
            )}
          </section>

          <section className="border-t border-line pt-5">
            <h2 className="mb-2 text-sm font-medium text-ink/60">
              {t.settingsTitle}
            </h2>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.requires_booking_confirmation}
                disabled={savingSettings}
                onChange={handleToggleConfirmation}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">
                  {t.requiresConfirmationLabel}
                </span>
                <span className="block text-sm text-ink/60">
                  {t.requiresConfirmationHint}
                </span>
              </span>
            </label>

            <div className="mt-4">
              <label className="block">
                <span className="block font-medium">{t.callOutFeeLabel}</span>
                <span className="mt-1 block text-sm text-ink/60">
                  {t.callOutFeeHint}
                </span>
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
                  className={`mt-2 w-32 ${inputClass}`}
                />
              </label>
            </div>

            <div className="mt-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={settings.share_location}
                  disabled={savingSettings}
                  onChange={handleToggleShareLocation}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">
                    {t.shareLocationLabel}
                  </span>
                  <span className="block text-sm text-ink/60">
                    {t.shareLocationHint}
                  </span>
                  {settings.share_location &&
                    locationStatusText(locationStatus, t) && (
                      <span className="mt-1 block text-sm text-ink/60">
                        {locationStatusText(locationStatus, t)}
                      </span>
                    )}
                </span>
              </label>
            </div>

            {settingsError && (
              <p className="mt-2 text-sm text-danger">{settingsError}</p>
            )}
          </section>

          <section className="border-t border-line pt-5">
            <WorkingHoursEditor />
          </section>
        </div>
      )}

      {tab === "password" && (
        <section>
          <form
            onSubmit={handleChangePassword}
            className="flex max-w-xs flex-col gap-3"
          >
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              required
              autoComplete="current-password"
              placeholder={t.currentPasswordPlaceholder}
              showLabel={t.showPassword}
              hideLabel={t.hidePassword}
            />
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              required
              // No minLength here (unlike the login field) — the length
              // check below is a custom message (changePasswordTooShortError)
              // rather than the browser's native validation bubble, so it
              // needs to actually reach handleChangePassword instead of being
              // intercepted by HTML5 constraint validation first.
              autoComplete="new-password"
              placeholder={t.newPasswordPlaceholder}
              showLabel={t.showPassword}
              hideLabel={t.hidePassword}
            />
            <PasswordInput
              value={confirmNewPassword}
              onChange={setConfirmNewPassword}
              required
              autoComplete="new-password"
              placeholder={t.confirmNewPasswordPlaceholder}
              showLabel={t.showPassword}
              hideLabel={t.hidePassword}
            />
            {changePasswordError && (
              <p className="text-sm text-danger">{changePasswordError}</p>
            )}
            {changePasswordSuccess && (
              <p className="text-sm text-accent-2">{t.changePasswordSuccess}</p>
            )}
            <CompactButton
              type="submit"
              disabled={changingPassword}
              className="self-start"
            >
              {changingPassword ? t.changingPassword : t.changePasswordButton}
            </CompactButton>
          </form>
        </section>
      )}
    </Card>
  );
}
