"use client";

/**
 * «Где мой мастер?» на главной (решения пользователя 12.11.2026):
 * - активные заказы, запомненные на этом устройстве (lib/myBookings.ts), и
 *   найденные по тому же телефону через любую ещё живую ссылку
 *   (/api/my-booking/{id}/history отдаёт и их ссылки);
 * - у каждого — переход на страницу заказа (статус, время приезда, карта),
 *   «Zmień termin» (только на свободный слот, на странице заказа) и
 *   «Anuluj», пока до начала больше CLIENT_CHANGE_MIN_HOURS (2 ч);
 * - в приложении ещё история всех заказов: приложение «помнит всё». В
 *   браузере отменённые и прошедшие заказы забываются.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  ApiError,
  type MyBooking,
  type MyBookingHistoryItem,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton } from "@/components/ui";
import {
  bookingUrl,
  forgetBooking,
  rememberBookingQuietly,
  remembersEverything,
  savedBookings,
  type SavedBooking,
} from "@/lib/myBookings";

const isActive = (status: string) => status === "pending" || status === "confirmed";

interface ActiveBooking {
  saved: SavedBooking;
  booking: MyBooking;
}

function isGone(e: unknown) {
  return e instanceof ApiError && (e.status === 404 || e.status === 403);
}

export default function MyBookingCard() {
  const { t, locale, ready } = useLocale();
  const [active, setActive] = useState<ActiveBooking[]>([]);
  const [history, setHistory] = useState<MyBookingHistoryItem[]>([]);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const keepAll = remembersEverything();

    // 1. История по телефону — через первую ещё живую ссылку
    let hist: MyBookingHistoryItem[] = [];
    for (const s of savedBookings()) {
      try {
        hist = await api.myBookingHistory(s.id, s.token, locale);
        break;
      } catch (e) {
        if (isGone(e)) forgetBooking(s.id);
      }
    }
    const now = Date.now();
    for (const h of hist) {
      if (!h.manage_token) continue;
      if (keepAll || (isActive(h.status) && Date.parse(h.start_at) > now - 6 * 3600_000)) {
        rememberBookingQuietly(h.id, h.manage_token);
      }
    }

    // 2. Активные — полные данные (можно ли ещё менять, время приезда)
    const histById = new Map(hist.map((h) => [h.id, h]));
    const candidates = savedBookings().filter((s) => {
      const h = histById.get(s.id);
      return !h || isActive(h.status);
    });
    const results = await Promise.all(
      candidates.map(async (saved) => {
        try {
          return { saved, booking: await api.getMyBooking(saved.id, saved.token, locale) };
        } catch (e) {
          if (isGone(e)) forgetBooking(saved.id);
          return null;
        }
      }),
    );
    const live: ActiveBooking[] = [];
    for (const r of results) {
      if (!r) continue;
      if (isActive(r.booking.status) && Date.parse(r.booking.end_at) > now) live.push(r);
      else if (!keepAll) forgetBooking(r.saved.id);
    }
    live.sort((a, b) => Date.parse(a.booking.start_at) - Date.parse(b.booking.start_at));
    setActive(live);

    const liveIds = new Set(live.map((a) => a.booking.id));
    setHistory(keepAll ? hist.filter((h) => !liveIds.has(h.id)) : []);
  }, [locale]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, refresh]);

  if (active.length === 0 && history.length === 0) return null;

  const tag = locale === "pl" ? "pl-PL" : "en-GB";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(tag, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Warsaw",
    }).format(new Date(iso));

  const cancel = async (a: ActiveBooking) => {
    setBusy(true);
    setError(null);
    try {
      await api.cancelMyBooking(a.saved.id, a.saved.token, locale);
      setConfirmCancel(null);
      await refresh();
    } catch {
      setError(t.myBookingActionError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {active.map((a) => (
        <div
          key={a.booking.id}
          className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-surface p-4 shadow-card"
        >
          <Link href={bookingUrl(a.saved)} className="flex items-center gap-3">
            <span aria-hidden className="text-2xl">📍</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{t.homeWhereIsMaster}</span>
              <span className="block truncate text-sm text-ink-2">
                {a.booking.service_name} · {fmt(a.booking.expected_arrival_at ?? a.booking.start_at)} ·{" "}
                {a.booking.status === "pending" ? t.homeBookingPending : t.homeBookingConfirmed}
              </span>
            </span>
            <span aria-hidden className="text-xl text-accent">›</span>
          </Link>
          {a.booking.can_change && (
            <div className="flex flex-wrap gap-2">
              {confirmCancel === a.booking.id ? (
                <>
                  <CompactButton variant="secondary" disabled={busy} onClick={() => void cancel(a)}>
                    {t.homeCancelSure}
                  </CompactButton>
                  <CompactButton disabled={busy} onClick={() => setConfirmCancel(null)}>
                    {t.homeKeepBooking}
                  </CompactButton>
                </>
              ) : (
                <>
                  <Link
                    href={bookingUrl(a.saved, "reschedule")}
                    className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-2"
                  >
                    {t.myBookingRescheduleButton}
                  </Link>
                  <CompactButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmCancel(a.booking.id)}
                  >
                    {t.myBookingCancelButton}
                  </CompactButton>
                </>
              )}
            </div>
          )}
          {error && confirmCancel === a.booking.id && (
            <p className="text-sm text-danger">{error}</p>
          )}
        </div>
      ))}

      {history.length > 0 && (
        <details className="rounded-2xl border border-line-soft bg-surface p-4">
          <summary className="cursor-pointer font-semibold text-ink">{t.homeHistoryTitle}</summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {history.map((h) => {
              const line = (
                <>
                  <span className="min-w-0 truncate">
                    {h.service_name} · {h.provider_name}
                  </span>
                  <span className="shrink-0 text-ink-2">
                    {fmt(h.start_at)} · {t.bookingStatusLabel[h.status] ?? h.status}
                  </span>
                </>
              );
              return (
                <li key={h.id}>
                  {h.manage_token ? (
                    <Link
                      href={bookingUrl({ id: h.id, token: h.manage_token })}
                      className="flex justify-between gap-2 hover:text-accent-2"
                    >
                      {line}
                    </Link>
                  ) : (
                    <div className="flex justify-between gap-2">{line}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
