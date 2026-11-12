"use client";

/**
 * «Где мой мастер?» на главной: ближайший активный заказ, запомненный на
 * этом устройстве (lib/myBookings.ts), со ссылкой на страницу заказа
 * (статус, время приезда, карта). Завершённые, отменённые и недоступные
 * заказы забываются; если активных нет — ничего не показываем.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type MyBooking } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import {
  bookingUrl,
  forgetBooking,
  savedBookings,
  type SavedBooking,
} from "@/lib/myBookings";

const ACTIVE = new Set(["pending", "confirmed"]);

export default function MyBookingCard() {
  const { t, locale, ready } = useLocale();
  const [found, setFound] = useState<{ saved: SavedBooking; booking: MyBooking } | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        savedBookings().map(async (saved) => {
          try {
            return { saved, booking: await api.getMyBooking(saved.id, saved.token, locale) };
          } catch (e) {
            // ссылка больше не открывается — забыть; сетевой сбой — оставить
            if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
              forgetBooking(saved.id);
            }
            return null;
          }
        }),
      );
      const now = Date.now();
      const active = results
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .filter((r) => {
          const keep = ACTIVE.has(r.booking.status) && Date.parse(r.booking.end_at) > now;
          if (!keep) forgetBooking(r.saved.id);
          return keep;
        })
        .sort((a, b) => Date.parse(a.booking.start_at) - Date.parse(b.booking.start_at));
      if (!cancelled) setFound(active[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, locale]);

  if (!found) return null;
  const { booking, saved } = found;
  const when = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(booking.expected_arrival_at ?? booking.start_at));

  return (
    <Link
      href={bookingUrl(saved)}
      className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-surface p-4 shadow-card transition hover:border-accent"
    >
      <span aria-hidden className="text-2xl">📍</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{t.homeWhereIsMaster}</span>
        <span className="block truncate text-sm text-ink-2">
          {booking.service_name} · {when} ·{" "}
          {booking.status === "pending" ? t.homeBookingPending : t.homeBookingConfirmed}
        </span>
      </span>
      <span aria-hidden className="text-xl text-accent">›</span>
    </Link>
  );
}
