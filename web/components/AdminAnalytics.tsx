"use client";

/** Детали аналитики суперадмина: цифры по каждому мастеру и каждой работе.
 *  Данные и фильтры — на странице /admin/analytics (AdminAnalyticsPage). */

import type { AdminAnalytics } from "@/lib/api";

const hours = (min: number) => (min / 60).toFixed(1);
const money = (v: string) => Number(v).toFixed(2);

export default function AdminAnalyticsDetails({
  data,
}: {
  data: AdminAnalytics;
}) {
  return (
    <section>
      {data.masters.length === 0 ? (
        <p className="text-sm text-ink-2">За период нет заказов.</p>
      ) : (
        <>
          <h3 className="mb-2 text-sm font-semibold text-ink">По мастерам</h3>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {data.masters.map((m) => (
              <div
                key={m.provider_id}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <div className="mb-2 font-semibold text-ink">{m.name}</div>
                <div className="mb-3 text-3xl font-semibold text-accent-2">
                  {m.completed}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-2">Часов</dt>
                  <dd className="text-right">{hours(m.total_minutes)}</dd>
                  <dt className="text-ink-2">Выручка</dt>
                  <dd className="text-right">{money(m.revenue)}</dd>
                  <dt className="text-ink-2">Средний чек</dt>
                  <dd className="text-right">
                    {m.avg_price ? money(m.avg_price) : "—"}
                  </dd>
                  <dt className="text-ink-2">Отмены</dt>
                  <dd className="text-right">{m.cancelled}</dd>
                  <dt className="text-ink-2">Не пришли</dt>
                  <dd className="text-right">{m.no_show}</dd>
                  <dt className="text-ink-2">Не подтвердил вовремя</dt>
                  <dd className="text-right">{m.timed_out ?? 0}</dd>
                </dl>
              </div>
            ))}
          </div>

          <h3 className="mb-2 text-sm font-semibold text-ink">По работам</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.services.map((s) => (
              <div
                key={s.service_id}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <div className="mb-2 font-semibold text-ink">{s.name}</div>
                <div className="mb-3 text-3xl font-semibold text-accent-2">
                  {s.completed}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-2">Часов</dt>
                  <dd className="text-right">{hours(s.total_minutes)}</dd>
                  <dt className="text-ink-2">Среднее время, мин</dt>
                  <dd className="text-right">{Math.round(s.avg_minutes)}</dd>
                  <dt className="text-ink-2">Выручка</dt>
                  <dd className="text-right">{money(s.revenue)}</dd>
                  <dt className="text-ink-2">Средний чек</dt>
                  <dd className="text-right">
                    {s.avg_price ? money(s.avg_price) : "—"}
                  </dd>
                  <dt className="text-ink-2">Отмены</dt>
                  <dd className="text-right">{s.cancelled}</dd>
                  <dt className="text-ink-2">Не пришли</dt>
                  <dd className="text-right">{s.no_show}</dd>
                  <dt className="text-ink-2">Не подтвердил вовремя</dt>
                  <dd className="text-right">{s.timed_out ?? 0}</dd>
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-ink-3">
        Выручка считается только по заказам с проставленной итоговой ценой.
      </p>
    </section>
  );
}
