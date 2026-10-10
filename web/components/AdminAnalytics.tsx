"use client";

/** Аналитика суперадмина: сводка по мастерам и цифры по каждой работе. */

import { useEffect, useState } from "react";
import { api, type AdminAnalytics, type AdminMaster } from "@/lib/api";
import { addDays, toDateParam } from "@/lib/format";
import { Card } from "@/components/ui";

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-ink";
const hours = (min: number) => (min / 60).toFixed(1);
const money = (v: string) => Number(v).toFixed(2);

export default function AdminAnalyticsPanel({
  masters,
}: {
  masters: AdminMaster[] | null;
}) {
  const [from, setFrom] = useState(() => toDateParam(addDays(new Date(), -29)));
  const [to, setTo] = useState(() => toDateParam(new Date()));
  const [providerId, setProviderId] = useState("");
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!from || !to || to < from) return;
    let alive = true;
    api
      .adminAnalytics(from, to, providerId || undefined)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(false);
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [from, to, providerId]);

  const totalDone = data?.masters.reduce((a, m) => a + m.completed, 0) ?? 0;
  const totalRevenue =
    data?.masters.reduce((a, m) => a + Number(m.revenue), 0) ?? 0;

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-ink">Аналитика</h2>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-xs text-ink/70">
          С
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs text-ink/70">
          По
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs text-ink/70">
          Мастер
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="">Все мастера</option>
            {(masters ?? []).map((m) => (
              <option key={m.provider_id} value={m.provider_id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="text-sm text-danger">Не удалось загрузить аналитику</p>
      )}
      {data && data.masters.length === 0 && (
        <p className="text-sm text-ink/60">За период нет заказов.</p>
      )}
      {data && data.masters.length > 0 && (
        <>
          <p className="mb-4 text-sm text-ink/80">
            Выполнено: <b>{totalDone}</b> · Выручка:{" "}
            <b>{totalRevenue.toFixed(2)}</b>
          </p>

          <h3 className="mb-2 text-sm font-semibold text-ink">По мастерам</h3>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {data.masters.map((m) => (
              <div
                key={m.provider_id}
                className="rounded-lg border border-line bg-white/50 p-4"
              >
                <div className="mb-2 font-semibold text-ink">{m.name}</div>
                <div className="mb-3 text-3xl font-semibold text-accent-2">
                  {m.completed}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink/60">Часов</dt>
                  <dd className="text-right">{hours(m.total_minutes)}</dd>
                  <dt className="text-ink/60">Выручка</dt>
                  <dd className="text-right">{money(m.revenue)}</dd>
                  <dt className="text-ink/60">Средний чек</dt>
                  <dd className="text-right">
                    {m.avg_price ? money(m.avg_price) : "—"}
                  </dd>
                  <dt className="text-ink/60">Отмены</dt>
                  <dd className="text-right">{m.cancelled}</dd>
                  <dt className="text-ink/60">Не пришли</dt>
                  <dd className="text-right">{m.no_show}</dd>
                </dl>
              </div>
            ))}
          </div>

          <h3 className="mb-2 text-sm font-semibold text-ink">По работам</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.services.map((s) => (
              <div
                key={s.service_id}
                className="rounded-lg border border-line bg-white/50 p-4"
              >
                <div className="mb-2 font-semibold text-ink">{s.name}</div>
                <div className="mb-3 text-3xl font-semibold text-accent-2">
                  {s.completed}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink/60">Часов</dt>
                  <dd className="text-right">{hours(s.total_minutes)}</dd>
                  <dt className="text-ink/60">Среднее время, мин</dt>
                  <dd className="text-right">{Math.round(s.avg_minutes)}</dd>
                  <dt className="text-ink/60">Выручка</dt>
                  <dd className="text-right">{money(s.revenue)}</dd>
                  <dt className="text-ink/60">Средний чек</dt>
                  <dd className="text-right">
                    {s.avg_price ? money(s.avg_price) : "—"}
                  </dd>
                  <dt className="text-ink/60">Отмены</dt>
                  <dd className="text-right">{s.cancelled}</dd>
                  <dt className="text-ink/60">Не пришли</dt>
                  <dd className="text-right">{s.no_show}</dd>
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-ink/50">
        Выручка считается только по заказам с проставленной итоговой ценой.
      </p>
    </Card>
  );
}
