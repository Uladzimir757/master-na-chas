"use client";

/** «Аналитика»: у каждой работы (услуги) свои цифры за выбранный период. */

import { useEffect, useState } from "react";
import { api, type Analytics } from "@/lib/api";
import { addDays, toDateParam } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import { inputClass } from "@/components/ui";

const hours = (min: number) => (min / 60).toFixed(1);

export default function AnalyticsPanel() {
  const { t } = useLocale();
  const [from, setFrom] = useState(() => toDateParam(addDays(new Date(), -29)));
  const [to, setTo] = useState(() => toDateParam(new Date()));
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!from || !to || to < from) return;
    let alive = true;
    api
      .getAnalytics(from, to)
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
  }, [from, to]);

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-ink">
        {t.analyticsTitle}
      </h2>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-xs text-ink/70">
          {t.analyticsFrom}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs text-ink/70">
          {t.analyticsTo}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{t.calendarLoadError}</p>}
      {data && data.services.length === 0 && (
        <p className="text-sm text-ink/60">{t.analyticsEmpty}</p>
      )}
      {data && data.services.length > 0 && (
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
                <dt className="text-ink/60">{t.analyticsColHours}</dt>
                <dd className="text-right">{hours(s.total_minutes)}</dd>
                <dt className="text-ink/60">{t.analyticsColAvgTime}</dt>
                <dd className="text-right">{Math.round(s.avg_minutes)}</dd>
                <dt className="text-ink/60">{t.analyticsColRevenue}</dt>
                <dd className="text-right">{Number(s.revenue).toFixed(2)}</dd>
                <dt className="text-ink/60">{t.analyticsColAvgCheck}</dt>
                <dd className="text-right">
                  {s.avg_price ? Number(s.avg_price).toFixed(2) : "—"}
                </dd>
                <dt className="text-ink/60">{t.analyticsColCancelled}</dt>
                <dd className="text-right">{s.cancelled}</dd>
                <dt className="text-ink/60">{t.analyticsColNoShow}</dt>
                <dd className="text-right">{s.no_show}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-ink/50">{t.analyticsNote}</p>
    </section>
  );
}
