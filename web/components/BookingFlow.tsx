"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  cityName,
  type PublicCity,
  type Provider,
  type ProviderServiceOffering,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Card, Centered } from "@/components/ui";
import { ChevronRightIcon, IconBadge, WrenchIcon } from "@/components/icons";
import { PriceLabel } from "@/components/PriceLabel";
import MasterPicker from "@/components/MasterPicker";
import SlotPicker from "@/components/SlotPicker";
import CityPicker from "@/components/CityPicker";

// The element on the home page that wraps this flow.
export const BOOKING_ID = "masters";

// The client's city, remembered between visits (a per-device convenience,
// see docs/confirm-timer-travel-cities-task.md).
const CITY_KEY = "zr_city";

function readStoredCity(): string | null {
  try {
    return window.localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

function storeCity(slug: string | null): void {
  try {
    if (slug) window.localStorage.setItem(CITY_KEY, slug);
    else window.localStorage.removeItem(CITY_KEY);
  } catch {
    /* ignore */
  }
}

// City first (only that city's masters are shown), then the master-first
// flow: pick a master (sorted by rating) ->
// pick one of THAT master's own offered services (his own price +
// description) -> pick a slot. Previously this started on a flat,
// combined-across-providers service list — see MasterPicker.tsx and
// git history for the old shape if it's ever needed again.
export default function BookingFlow() {
  const { locale, t, ready } = useLocale();

  const [cities, setCities] = useState<PublicCity[] | null>(null);
  const [city, setCity] = useState<PublicCity | null>(null);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null,
  );
  const [providerServices, setProviderServices] = useState<
    ProviderServiceOffering[] | null
  >(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedService, setSelectedService] =
    useState<ProviderServiceOffering | null>(null);

  // The remembered city if it's still offered, otherwise the client picks
  // (from the list or by location) — even when there's only one city.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const list = await api.listCities();
        setCities(list);
        const stored = readStoredCity();
        setCity(list.find((c) => c.slug === stored) ?? null);
      } catch {
        setLoadError(t.masterListLoadError);
      }
    })();
    // t is derived from `locale` and would re-run this on every translation
    // object identity change; `ready` alone covers the real trigger (this
    // effect only ever needs to run once ready flips true).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready || !city) return;
    (async () => {
      setProvidersLoaded(false);
      try {
        const prov = await api.listProviders(city.slug);
        setProviders(prov);
        setProvidersLoaded(true);
      } catch {
        setLoadError(t.masterListLoadError);
      }
    })();
    // Same rationale as above — t tracked via `locale` already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, city]);

  const pickCity = useCallback((c: PublicCity) => {
    storeCity(c.slug);
    setCity(c);
  }, []);
  const changeCity = useCallback(() => {
    storeCity(null);
    setCity(null);
    setSelectedProvider(null);
    setProviderServices(null);
    setSelectedService(null);
  }, []);

  // Reloads whenever the resolved locale changes (switcher click) — names
  // are resolved server-side per lang, same as the old flat list was.
  useEffect(() => {
    if (!ready || !selectedProvider) return;
    (async () => {
      setProviderServices(null);
      setServicesError(null);
      setSelectedService(null);
      try {
        const svc = await api.listProviderServices(selectedProvider.id, locale);
        setProviderServices(svc);
        if (svc.length === 1) {
          setSelectedService(svc[0]);
        }
      } catch {
        setServicesError(t.masterServicesLoadError);
      }
    })();
    // Same rationale as above — t tracked via `locale` already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, locale, ready]);

  // The hero stays above this flow, so a new step could open out of view on a
  // phone — bring its top back on screen whenever the step moves forward.
  useEffect(() => {
    if (!selectedProvider) return;
    document.getElementById(BOOKING_ID)?.scrollIntoView({ block: "start" });
  }, [selectedProvider, selectedService]);

  // Each step forward pushes a history entry, so the phone's back gesture /
  // browser back button steps back inside the flow instead of leaving the
  // site (steps are React state, not routes, so there was nothing to go
  // back to). The in-page "back" buttons call history.back() too, keeping
  // one source of truth for "where back goes".
  const pickProvider = useCallback((p: Provider) => {
    window.history.pushState({ zr: "services" }, "");
    setSelectedProvider(p);
  }, []);
  const pickService = useCallback((s: ProviderServiceOffering) => {
    window.history.pushState({ zr: "slots" }, "");
    setSelectedService(s);
  }, []);
  const goBack = useCallback(() => window.history.back(), []);

  useEffect(() => {
    const onPop = () => {
      if (
        selectedService &&
        providerServices !== null &&
        providerServices.length > 1
      ) {
        setSelectedService(null);
      } else {
        // Slots step with an auto-picked single service, or the services
        // step itself: both go straight back to the master list.
        setSelectedService(null);
        setSelectedProvider(null);
        setProviderServices(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [selectedService, providerServices]);

  if (!ready) {
    return <Centered>…</Centered>;
  }

  if (loadError) {
    return <Centered>{loadError}</Centered>;
  }

  if (cities === null) {
    return <Centered>{t.loading}</Centered>;
  }

  if (!city) {
    return <CityPicker cities={cities} onPick={pickCity} />;
  }

  if (!providersLoaded) {
    return <Centered>{t.loading}</Centered>;
  }

  // Город и «Zmień miasto» — на каждом шаге после выбора города: раньше
  // кнопка была только в списке мастеров, и с экрана мастера/услуги/слотов
  // сменить город было нельзя (12.11.2026).
  const cityBar = (
    <div className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 text-base text-ink-2 sm:mx-6">
      <span>{t.cityCurrent(cityName(city, locale))}</span>
      <button
        className="min-h-11 text-accent underline-offset-4 hover:underline"
        onClick={changeCity}
      >
        {t.cityChange}
      </button>
    </div>
  );

  if (!selectedProvider) {
    return (
      <>
        {cityBar}
        {providers.length === 0 ? (
          <Card>
            <p className="mb-4 text-base">{t.cityNoMasters}</p>
            <button
              className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 py-2 text-base font-semibold text-on-accent transition hover:bg-accent-2"
              onClick={changeCity}
            >
              {t.cityChange}
            </button>
          </Card>
        ) : (
          <MasterPicker providers={providers} onSelect={pickProvider} />
        )}
      </>
    );
  }

  if (!selectedService) {
    return (
      <>
        {cityBar}
        <Card>
          <button
            className="mb-3 min-h-11 text-base text-ink-3 hover:text-accent-2"
            onClick={goBack}
          >
            {t.backToMasters}
          </button>
          <h1 className="mb-5 text-2xl font-bold tracking-[-0.01em] sm:text-3xl">
            {selectedProvider.name}
          </h1>

          {servicesError && <Centered>{servicesError}</Centered>}
          {!servicesError && providerServices === null && (
            <Centered>{t.loading}</Centered>
          )}
          {!servicesError &&
            providerServices !== null &&
            providerServices.length === 0 && (
              <Centered>{t.noServicesOffered}</Centered>
            )}
          {!servicesError &&
            providerServices !== null &&
            providerServices.length > 0 && (
              <div className="flex flex-col gap-3">
                {providerServices.map((s) => (
                  <button
                    key={s.id}
                    className="flex items-center gap-4 rounded-2xl border border-line-soft bg-surface p-5 text-left shadow-card transition hover:border-accent"
                    onClick={() => pickService(s)}
                  >
                    <IconBadge>
                      <WrenchIcon />
                    </IconBadge>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold">{s.name}</div>
                      <div className="text-base text-ink-2">
                        {t.durationMinutes(s.duration_minutes)}
                        {s.price_min != null || s.price_max != null ? (
                          <>
                            {" · "}
                            <PriceLabel
                              min={s.price_min}
                              max={s.price_max}
                              t={t}
                            />
                          </>
                        ) : null}
                      </div>
                      {s.description && (
                        <div className="mt-1 text-base text-ink-2">
                          {s.description}
                        </div>
                      )}
                    </div>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                      <ChevronRightIcon className="h-6 w-6" />
                    </span>
                  </button>
                ))}
              </div>
            )}
        </Card>
      </>
    );
  }

  // key={...}: switching provider or service mounts a brand-new SlotPicker
  // instance instead of reusing one whose internal state (slots/
  // selectedDateKey/etc.) would need to be manually reset.
  const multipleServices =
    providerServices !== null && providerServices.length > 1;
  return (
    <>
      {cityBar}
      {/* With several services SlotPicker shows its own "change service"
        control; with one (auto-picked) there was no way back at all. */}
      {!multipleServices && (
        <button
          className="mx-3 mb-2 min-h-11 text-base text-ink-3 hover:text-accent-2 sm:mx-6"
          onClick={goBack}
        >
          {t.backToMasters}
        </button>
      )}
      <SlotPicker
        key={`${selectedProvider.id}-${selectedService.id}`}
        service={selectedService}
        providers={[selectedProvider]}
        providerId={selectedProvider.id}
        cityId={city.id}
        description={selectedService.description}
        showChangeService={multipleServices}
        onChangeService={goBack}
      />
    </>
  );
}
