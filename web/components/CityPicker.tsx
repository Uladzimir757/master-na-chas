"use client";

/**
 * Первый шаг на главной — город (docs/confirm-timer-travel-cities-task.md).
 * Все активные города (решение 11.11.2026), город без мастеров — с
 * пометкой; плюс «по моей локализации»: ближайший к точке телефона город из
 * тех, у кого есть координаты.
 */

import { useState } from "react";
import { cityName, type PublicCity } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Card, Centered } from "@/components/ui";

/** Расстояние по сфере, км — для выбора ближайшего города. */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function nearestCity(cities: PublicCity[], lat: number, lng: number): PublicCity | null {
  let best: PublicCity | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    if (c.lat == null || c.lng == null) continue;
    const km = distanceKm(lat, lng, c.lat, c.lng);
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}

export default function CityPicker({
  cities,
  onPick,
}: {
  cities: PublicCity[];
  onPick: (city: PublicCity) => void;
}) {
  const { t, locale } = useLocale();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocateError(true);
      return;
    }
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const city = nearestCity(cities, pos.coords.latitude, pos.coords.longitude);
        if (city) onPick(city);
        else setLocateError(true);
      },
      () => {
        setLocating(false);
        setLocateError(true);
      },
      // enableHighAccuracy: в WebView на Xiaomi (HyperOS) низкая точность не
      // отвечает вовсе (таймаут) — проверено на телефоне 12.11.2026
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10 * 60_000 },
    );
  };

  return (
    <Card>
      <h1 className="mb-5 text-[1.75rem] leading-tight font-extrabold tracking-[-0.015em] sm:text-4xl">
        {t.cityPickTitle}
      </h1>
      {cities.length === 0 ? (
        <Centered>{t.noCities}</Centered>
      ) : (
        <>
          <button
            type="button"
            disabled={locating}
            onClick={locate}
            className="mb-2 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 py-2 text-base font-semibold text-on-accent transition hover:bg-accent-2 disabled:opacity-60"
          >
            <span aria-hidden>📍</span>
            {locating ? t.cityLocating : t.cityUseLocation}
          </button>
          {locateError && <p className="mb-2 text-sm text-danger">{t.cityLocationError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {cities.map((c) => (
              <button
                key={c.id}
                className={`min-h-11 rounded-full border px-5 py-2 text-base transition hover:border-accent hover:text-accent-2 ${
                  c.has_masters
                    ? "border-line bg-surface font-medium"
                    : "border-line-soft bg-transparent text-ink-3"
                }`}
                onClick={() => onPick(c)}
              >
                {cityName(c, locale)}
                {!c.has_masters && <span className="ml-1 text-sm">· {t.cityNoMastersYet}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
