"use client";

import { useEffect, useState } from "react";
import { api, type Provider, type Service } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Card, Centered } from "@/components/ui";
import { PriceLabel } from "@/components/PriceLabel";
import SlotPicker from "@/components/SlotPicker";

export default function BookingFlow() {
  const { locale, t, ready } = useLocale();

  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Reloads whenever the resolved locale changes (switcher click) — Service
  // names are resolved server-side per lang (see lib/api.ts's listServices),
  // so a language switch needs a fresh fetch, not just a re-render.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      setCatalogLoaded(false);
      setSelectedService(null);
      try {
        const [svc, prov] = await Promise.all([api.listServices(locale), api.listProviders()]);
        setServices(svc);
        setProviders(prov);
        setCatalogLoaded(true);
        if (svc.length === 1) {
          setSelectedService(svc[0]);
        }
      } catch {
        setLoadError(t.catalogLoadError);
      }
    })();
    // t is derived from `locale` (see lib/LocaleContext.tsx) and would
    // otherwise re-run this effect on every translation-object identity
    // change; `locale`/`ready` alone already cover every real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, ready]);

  if (!ready) {
    return <Centered>…</Centered>;
  }

  if (loadError) {
    return <Centered>{loadError}</Centered>;
  }

  if (!catalogLoaded) {
    return <Centered>{t.loading}</Centered>;
  }

  if (!selectedService) {
    return (
      <Card>
        <h1 className="mb-4 text-xl font-extrabold tracking-[-0.01em]">{t.pickServiceTitle}</h1>
        <div className="flex flex-col gap-2">
          {services.map((s) => (
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
            </button>
          ))}
        </div>
      </Card>
    );
  }

  // key={selectedService.id}: switching services mounts a brand-new
  // SlotPicker instance instead of reusing one whose internal state
  // (slots/selectedDateKey/etc.) would need to be manually reset.
  return (
    <SlotPicker
      key={selectedService.id}
      service={selectedService}
      providers={providers}
      showChangeService={services.length > 1}
      onChangeService={() => setSelectedService(null)}
    />
  );
}
