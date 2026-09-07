"use client";

import { useEffect, useState } from "react";
import { api, type Provider, type ProviderServiceOffering } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Card, Centered } from "@/components/ui";
import { PriceLabel } from "@/components/PriceLabel";
import MasterPicker from "@/components/MasterPicker";
import SlotPicker from "@/components/SlotPicker";

// Master-first flow (this segment): pick a master (sorted by rating) ->
// pick one of THAT master's own offered services (his own price +
// description) -> pick a slot. Previously this started on a flat,
// combined-across-providers service list — see MasterPicker.tsx and
// git history for the old shape if it's ever needed again.
export default function BookingFlow() {
  const { locale, t, ready } = useLocale();

  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [providerServices, setProviderServices] = useState<ProviderServiceOffering[] | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ProviderServiceOffering | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setProvidersLoaded(false);
      try {
        const prov = await api.listProviders();
        setProviders(prov);
        setProvidersLoaded(true);
      } catch {
        setLoadError(t.masterListLoadError);
      }
    })();
    // t is derived from `locale` and would re-run this on every translation
    // object identity change; `ready` alone covers the real trigger (this
    // effect only ever needs to run once ready flips true).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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

  if (!ready) {
    return <Centered>…</Centered>;
  }

  if (loadError) {
    return <Centered>{loadError}</Centered>;
  }

  if (!providersLoaded) {
    return <Centered>{t.loading}</Centered>;
  }

  if (!selectedProvider) {
    return <MasterPicker providers={providers} onSelect={setSelectedProvider} />;
  }

  if (!selectedService) {
    return (
      <Card>
        <button
          className="mb-3 text-sm text-ink/50 hover:text-accent-2"
          onClick={() => {
            setSelectedProvider(null);
            setProviderServices(null);
          }}
        >
          {t.backToMasters}
        </button>
        <h1 className="mb-4 text-xl font-extrabold tracking-[-0.01em]">{selectedProvider.name}</h1>

        {servicesError && <Centered>{servicesError}</Centered>}
        {!servicesError && providerServices === null && <Centered>{t.loading}</Centered>}
        {!servicesError && providerServices !== null && providerServices.length === 0 && (
          <Centered>{t.noServicesOffered}</Centered>
        )}
        {!servicesError && providerServices !== null && providerServices.length > 0 && (
          <div className="flex flex-col gap-2">
            {providerServices.map((s) => (
              <button
                key={s.id}
                className="rounded-md border border-line px-4 py-4 text-left hover:border-accent-2"
                onClick={() => setSelectedService(s)}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-ink/60">
                  {t.durationMinutes(s.duration_minutes)}
                  {s.price_min != null || s.price_max != null ? (
                    <>
                      {" · "}
                      <PriceLabel min={s.price_min} max={s.price_max} t={t} />
                    </>
                  ) : null}
                </div>
                {s.description && <div className="mt-1 text-sm text-ink/70">{s.description}</div>}
              </button>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // key={...}: switching provider or service mounts a brand-new SlotPicker
  // instance instead of reusing one whose internal state (slots/
  // selectedDateKey/etc.) would need to be manually reset.
  return (
    <SlotPicker
      key={`${selectedProvider.id}-${selectedService.id}`}
      service={selectedService}
      providers={[selectedProvider]}
      providerId={selectedProvider.id}
      description={selectedService.description}
      showChangeService={providerServices !== null && providerServices.length > 1}
      onChangeService={() => setSelectedService(null)}
    />
  );
}
