"use client";

import { useEffect, useState } from "react";
import { api, type Provider, type Service } from "@/lib/api";
import { formatPriceRange } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Card, Centered } from "@/components/ui";
import SlotPicker from "@/components/SlotPicker";

export default function BookingFlow() {
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Loads once. Nothing here is synced back out via setState-on-dependency-
  // change, so there's no reset-in-effect pattern to fight with the linter
  // over.
  useEffect(() => {
    (async () => {
      try {
        const [svc, prov] = await Promise.all([api.listServices(), api.listProviders()]);
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
  }, []);

  if (loadError) {
    return <Centered>{loadError}</Centered>;
  }

  if (!catalogLoaded) {
    return <Centered>{t.loading}</Centered>;
  }

  if (!selectedService) {
    return (
      <Card>
        <h1 className="mb-4 text-xl font-semibold">{t.pickServiceTitle}</h1>
        <div className="flex flex-col gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              className="rounded-lg border border-neutral-200 px-4 py-3 text-left hover:border-neutral-400"
              onClick={() => setSelectedService(s)}
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-neutral-500">
                {t.durationMinutes(s.duration_minutes)}
                {formatPriceRange(s.price_min, s.price_max) ? ` · ${formatPriceRange(s.price_min, s.price_max)}` : ""}
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
