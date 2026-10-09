"use client";

/**
 * «Моя запись» — публичная страница по ссылке из SMS клиенту
 * (/booking/?id=…&token=…, query-параметры — тот же статический экспорт, что
 * и у /review/). Здесь клиент видит запись, может отменить или перенести её
 * (пока не закрылось окно, см. CLIENT_CHANGE_MIN_HOURS на бэкенде), видит
 * живую точку мастера по пути и историю своих прошлых заказов.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type MyBooking,
  type MyBookingHistoryItem,
  type Slot,
} from "@/lib/api";
import { toDateParam, addDays } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ProviderMap from "@/components/ProviderMap";
import { Card, Centered, CompactButton } from "@/components/ui";

const SLOT_DAYS = 7;
const POLL_MS = 30_000;

export default function MyBookingPage() {
  const { t, ready, locale } = useLocale();
  const [id, setId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [booking, setBooking] = useState<MyBooking | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [history, setHistory] = useState<MyBookingHistoryItem[]>([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // «обновлено N мин назад» — время тикает вместе с опросом, а не читается
  // из Date.now() прямо при рендере (react-hooks/purity)
  const [now, setNow] = useState(() => Date.now());

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
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(tag, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Warsaw",
    }).format(new Date(iso));

  const load = useCallback(async (bid: string, tok: string) => {
    try {
      setBooking(await api.getMyBooking(bid, tok));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const bid = p.get("id");
    const tok = p.get("token");
    let timer: ReturnType<typeof setInterval> | undefined;
    // setState внутри async-IIFE — как в LocaleContext/WorkingHoursEditor
    // (react-hooks/set-state-in-effect режет прямые вызовы в теле эффекта)
    (async () => {
      setId(bid);
      setToken(tok);
      if (!bid || !tok) {
        setLoadFailed(true);
        return;
      }
      void load(bid, tok);
      api
        .myBookingHistory(bid, tok)
        .then(setHistory)
        .catch(() => setHistory([]));
      // живая точка мастера обновляется раз в полминуты
      timer = setInterval(() => {
        setNow(Date.now());
        void load(bid, tok);
      }, POLL_MS);
    })();
    return () => clearInterval(timer);
  }, [load]);

  const startPicking = async () => {
    if (!id || !token) return;
    setPicking(true);
    setChosen(null);
    setError(null);
    try {
      const today = new Date();
      setSlots(
        await api.myBookingSlots(
          id,
          token,
          toDateParam(today),
          toDateParam(addDays(today, SLOT_DAYS)),
        ),
      );
    } catch {
      setSlots([]);
    }
  };

  const slotsByDay = useMemo(() => {
    const out = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Warsaw",
      }).format(new Date(s.start_at));
      out.set(day, [...(out.get(day) ?? []), s]);
    }
    return Array.from(out.entries());
  }, [slots]);

  const run = async (fn: () => Promise<MyBooking>, okMsg: string) => {
    setBusy(true);
    setError(null);
    try {
      setBooking(await fn());
      setMessage(okMsg);
      setPicking(false);
    } catch {
      setError(t.myBookingActionError);
    } finally {
      setBusy(false);
    }
  };

  const minutesAgo = (iso: string) =>
    Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 px-0 py-6 sm:px-4 sm:py-10">
      <div className="flex w-full max-w-md justify-end px-3">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <Card>
          {!ready && <Centered>{""}</Centered>}
          {ready && loadFailed && <Centered>{t.myBookingLoadError}</Centered>}
          {ready && !loadFailed && !booking && <Centered>{t.loading}</Centered>}
          {ready && booking && (
            <div className="flex flex-col gap-4">
              <h1 className="text-lg font-bold">{t.myBookingTitle}</h1>
              <div>
                <div className="font-medium">{booking.service_name}</div>
                <div className="text-sm text-ink/70">
                  {booking.provider_name} · {fmt(booking.start_at)}–
                  {fmtTime(booking.end_at)}
                </div>
                <span className="mt-2 inline-block rounded-full bg-line/60 px-2.5 py-1 text-xs">
                  {t.bookingStatusLabel[booking.status] ?? booking.status}
                </span>
              </div>

              {booking.location && (
                <div>
                  <p className="mb-1.5 text-sm font-medium">
                    {t.myBookingMasterOnWay}
                  </p>
                  <ProviderMap
                    lat={booking.location.lat}
                    lng={booking.location.lng}
                  />
                  <p className="mt-1 text-xs text-ink/60">
                    {minutesAgo(booking.location.updated_at) < 1
                      ? t.masterLocationJustNow
                      : t.masterLocationMinutesAgo(
                          minutesAgo(booking.location.updated_at),
                        )}
                  </p>
                </div>
              )}

              {message && <p className="text-sm text-accent-2">{message}</p>}
              {error && <p className="text-sm text-danger">{error}</p>}

              {booking.can_change && !picking && (
                <>
                  <p className="text-xs text-ink/60">
                    {t.myBookingTooLate} {fmt(booking.change_deadline)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <CompactButton disabled={busy} onClick={startPicking}>
                      {t.myBookingRescheduleButton}
                    </CompactButton>
                    <CompactButton
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        id &&
                        token &&
                        run(
                          () => api.cancelMyBooking(id, token),
                          t.myBookingCancelled,
                        )
                      }
                    >
                      {t.myBookingCancelButton}
                    </CompactButton>
                  </div>
                </>
              )}
              {!booking.can_change &&
                (booking.status === "pending" ||
                  booking.status === "confirmed") && (
                  <p className="text-sm text-ink/70">
                    {t.myBookingTooLateCall}
                  </p>
                )}

              {picking && (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    {t.myBookingPickNewTime}
                  </p>
                  {slots === null && (
                    <p className="text-sm text-ink/60">{t.loading}</p>
                  )}
                  {slots !== null && slotsByDay.length === 0 && (
                    <p className="text-sm text-ink/60">{t.myBookingNoSlots}</p>
                  )}
                  <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
                    {slotsByDay.map(([day, list]) => (
                      <div key={day}>
                        <div className="mb-1 text-xs capitalize text-ink/60">
                          {new Intl.DateTimeFormat(tag, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            timeZone: "Europe/Warsaw",
                          }).format(new Date(list[0].start_at))}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((s) => (
                            <button
                              key={s.start_at}
                              type="button"
                              onClick={() => setChosen(s)}
                              className={`rounded-md border px-3 py-1.5 text-sm ${
                                chosen?.start_at === s.start_at
                                  ? "border-accent bg-accent text-white"
                                  : "border-line hover:border-accent"
                              }`}
                            >
                              {fmtTime(s.start_at)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {chosen && (
                    <div className="mt-3">
                      <CompactButton
                        disabled={busy}
                        onClick={() =>
                          id &&
                          token &&
                          run(
                            () =>
                              api.rescheduleMyBooking(
                                id,
                                token,
                                chosen.start_at,
                              ),
                            t.myBookingMoved,
                          )
                        }
                      >
                        {t.myBookingConfirmMove}
                      </CompactButton>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-line pt-3">
                <h2 className="mb-2 text-sm font-semibold">
                  {t.myBookingHistoryTitle}
                </h2>
                {history.length <= 1 ? (
                  <p className="text-sm text-ink/60">
                    {t.myBookingHistoryEmpty}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {history
                      .filter((h) => h.id !== booking.id)
                      .map((h) => (
                        <li key={h.id} className="flex justify-between gap-2">
                          <span>
                            {h.service_name} · {h.provider_name}
                          </span>
                          <span className="shrink-0 text-ink/60">
                            {fmt(h.start_at)} ·{" "}
                            {t.bookingStatusLabel[h.status] ?? h.status}
                            {h.price
                              ? ` · ${Number(h.price).toFixed(0)} zł`
                              : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
