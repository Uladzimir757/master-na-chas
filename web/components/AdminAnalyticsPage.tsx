"use client";

/** Страница /admin/analytics — полная аналитика суперадмина: ключевые цифры
 *  со сравнением с прошлым периодом, воронка статусов, динамика по дням,
 *  часы и дни недели, города, затем мастера и работы. Только для админа
 *  (вход — на /admin). */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  api,
  type AdminAnalytics,
  type AdminMaster,
  type AdminOverview,
  type OverviewTotals,
} from "@/lib/api";
import { addDays, toDateParam } from "@/lib/format";
import { Card, Centered, CompactButton } from "@/components/ui";
import AdminAnalyticsDetails from "@/components/AdminAnalytics";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink";
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const PRESETS: [string, number][] = [
  ["7 дней", 7],
  ["30 дней", 30],
  ["90 дней", 90],
  ["Год", 365],
];
const money = (v: string | number) =>
  Number(v).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Изменение к прошлому периоду: «▲ 12%» / «▼ 5%»; без базы — «раньше было 0». */
function Delta({
  now,
  before,
  invert = false,
}: {
  now: number;
  before: number;
  invert?: boolean; // true: рост — это плохо (отмены)
}) {
  if (now === before)
    return <span className="text-xs text-ink-3">без изменений</span>;
  if (!before) return <span className="text-xs text-ink-3">раньше было 0</span>;
  const pct = Math.round(((now - before) * 100) / before);
  const good = invert ? now < before : now > before;
  return (
    <span className={`text-xs ${good ? "text-accent-2" : "text-danger"}`}>
      {now > before ? "▲" : "▼"} {Math.abs(pct)}% к прошлому периоду
    </span>
  );
}

function Kpi({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="my-1 text-2xl font-semibold text-accent-2">{value}</div>
      {children}
    </div>
  );
}

function Bars({
  items,
  tall = false,
}: {
  items: { value: number; title: string }[];
  tall?: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={`flex items-end gap-px ${tall ? "h-40" : "h-28"}`}>
      {items.map((i, idx) => (
        <div
          key={idx}
          title={i.title}
          className="flex h-full min-w-0 flex-1 flex-col justify-end"
        >
          <div
            className="w-full rounded-t bg-accent"
            style={{
              height: `${(i.value / max) * 100}%`,
              minHeight: i.value ? 2 : 0,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Funnel({ t }: { t: OverviewTotals }) {
  const rows: [string, number, string][] = [
    ["Выполнено", t.completed, "bg-accent"],
    ["Подтверждены, ещё впереди", t.confirmed, "bg-accent-2"],
    ["Ждут мастера", t.pending, "bg-amber-400"],
    ["Отмена клиентом/мастером", t.cancelled, "bg-danger"],
    ["Мастер не ответил вовремя", t.timed_out, "bg-purple-400"],
    ["Клиент не пришёл", t.no_show, "bg-ink-3"],
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, n, color]) => (
        <div key={label} className="text-sm">
          <div className="mb-0.5 flex justify-between">
            <span className="text-ink-2">{label}</span>
            <b>{n}</b>
          </div>
          <div className="h-2 rounded bg-bg">
            <div
              className={`h-2 rounded ${color}`}
              style={{ width: `${(n / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [auth, setAuth] = useState<"checking" | "anon" | "authed">("checking");
  const [masters, setMasters] = useState<AdminMaster[]>([]);
  const [from, setFrom] = useState(() => toDateParam(addDays(new Date(), -29)));
  const [to, setTo] = useState(() => toDateParam(new Date()));
  const [providerId, setProviderId] = useState("");
  // Загруженные фильтры меняются только по «Применить»/пресету, не на каждый ввод.
  const [applied, setApplied] = useState(() => ({ from, to, providerId }));
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [details, setDetails] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState(false);
  const canApply = Boolean(from && to && to >= from);

  useEffect(() => {
    api
      .adminMe()
      .then(() => {
        setAuth("authed");
        api.listMasters().then(setMasters).catch(() => {});
      })
      .catch(() => setAuth("anon"));
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    let alive = true;
    const pid = applied.providerId || undefined;
    Promise.all([
      api.adminAnalyticsOverview(applied.from, applied.to, pid),
      api.adminAnalytics(applied.from, applied.to, pid),
    ])
      .then(([o, d]) => {
        if (!alive) return;
        setOverview(o);
        setDetails(d);
        setError(false);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [auth, applied]);

  function preset(days: number) {
    const f = toDateParam(addDays(new Date(), -(days - 1)));
    const tt = toDateParam(new Date());
    setFrom(f);
    setTo(tt);
    setApplied({ from: f, to: tt, providerId });
  }

  if (auth === "checking") return <Centered>Загрузка…</Centered>;
  if (auth === "anon") {
    return (
      <Card>
        <p className="mb-3 text-sm text-ink-2">Нужен вход администратора.</p>
        <Link href="/admin/" className="text-accent-2 underline">
          Войти в админ-панель
        </Link>
      </Card>
    );
  }

  const t = overview?.totals;
  const p = overview?.previous;
  const hasData = Boolean(t && t.orders > 0);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Аналитика</h1>
        <Link
          href="/admin/"
          className="inline-flex min-h-10 items-center rounded-md border border-accent bg-surface px-4 text-sm font-semibold text-accent-2 hover:bg-bg"
        >
          ← В админ-панель
        </Link>
      </div>

      <Card>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canApply) setApplied({ from, to, providerId });
          }}
        >
          <label className="text-xs text-ink-2">
            С
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-ink-2">
            По
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-ink-2">
            Мастер
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">Все мастера</option>
              {masters.map((m) => (
                <option key={m.provider_id} value={m.provider_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <CompactButton type="submit" disabled={!canApply}>
            Применить
          </CompactButton>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {PRESETS.map(([label, d]) => (
            <CompactButton
              key={label}
              type="button"
              variant="secondary"
              onClick={() => preset(d)}
            >
              {label}
            </CompactButton>
          ))}
        </div>
      </Card>

      {error && (
        <p className="text-sm text-danger">Не удалось загрузить аналитику</p>
      )}
      {!overview && !error && <Centered>Загрузка…</Centered>}
      {overview && !hasData && (
        <p className="text-sm text-ink-2">За период нет заказов.</p>
      )}

      {overview && t && p && hasData && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Заказов" value={String(t.orders)}>
              <Delta now={t.orders} before={p.orders} />
            </Kpi>
            <Kpi label="Выполнено" value={String(t.completed)}>
              <Delta now={t.completed} before={p.completed} />
            </Kpi>
            <Kpi label="Выручка, zł" value={money(t.revenue)}>
              <Delta now={Number(t.revenue)} before={Number(p.revenue)} />
            </Kpi>
            <Kpi
              label="Средний чек, zł"
              value={t.avg_price ? money(t.avg_price) : "—"}
            />
            <Kpi
              label="Доля выполненных"
              value={t.completion_rate == null ? "—" : `${t.completion_rate}%`}
            >
              <span className="text-xs text-ink-3">от заказов с исходом</span>
            </Kpi>
            <Kpi
              label="Отмены"
              value={t.cancel_rate == null ? "—" : `${t.cancel_rate}%`}
            >
              <Delta now={t.cancelled} before={p.cancelled} invert />
            </Kpi>
            <Kpi
              label="Мастер не ответил"
              value={t.timeout_rate == null ? "—" : `${t.timeout_rate}%`}
            >
              <Delta now={t.timed_out} before={p.timed_out} invert />
            </Kpi>
            <Kpi label="Часов работы" value={t.hours.toFixed(1)} />
            <Kpi label="Клиентов" value={String(t.clients)}>
              <span className="text-xs text-ink-3">
                повторных: {t.repeat_clients}
              </span>
            </Kpi>
            <Kpi
              label="Средняя оценка"
              value={t.avg_rating == null ? "—" : t.avg_rating.toFixed(2)}
            >
              <span className="text-xs text-ink-3">отзывов: {t.reviews}</span>
            </Kpi>
            <Kpi label="Жалоб клиентов" value={String(t.problems)}>
              <span className="text-xs text-ink-3">«Jest problem»</span>
            </Kpi>
          </section>

          <Card surface>
            <h2 className="mb-3 text-lg font-semibold text-ink">
              Воронка заказов
            </h2>
            <Funnel t={t} />
          </Card>

          <Card surface>
            <h2 className="mb-1 text-lg font-semibold text-ink">
              Заказы по дням
            </h2>
            <p className="mb-3 text-xs text-ink-3">
              По дню записи; наведите на столбик, чтобы увидеть цифры.
            </p>
            <Bars
              tall
              items={overview.days.map((d) => ({
                value: d.orders,
                title: `${d.day}: заказов ${d.orders}, выполнено ${d.completed}, выручка ${money(d.revenue)} zł`,
              }))}
            />
            <div className="mt-1 flex justify-between text-xs text-ink-3">
              <span>{overview.days[0]?.day}</span>
              <span>{overview.days[overview.days.length - 1]?.day}</span>
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card surface>
              <h2 className="mb-3 text-lg font-semibold text-ink">
                По дням недели
              </h2>
              <Bars
                items={overview.weekdays.map((w) => ({
                  value: w.orders,
                  title: `${WEEKDAYS[w.key]}: ${w.orders}`,
                }))}
              />
              <div className="mt-1 flex gap-px text-xs text-ink-3">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="flex-1 text-center">
                    {w}
                  </span>
                ))}
              </div>
            </Card>
            <Card surface>
              <h2 className="mb-3 text-lg font-semibold text-ink">По часам</h2>
              <Bars
                items={overview.hours.map((h) => ({
                  value: h.orders,
                  title: `${h.key}:00 — ${h.orders}`,
                }))}
              />
              <div className="mt-1 flex justify-between text-xs text-ink-3">
                <span>0:00</span>
                <span>12:00</span>
                <span>23:00</span>
              </div>
            </Card>
          </div>
          <p className="-mt-3 text-xs text-ink-3">
            Дни недели и часы — без отменённых заказов.
          </p>

          <Card surface>
            <h2 className="mb-3 text-lg font-semibold text-ink">По городам</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-2">
                  <th className="py-1">Город</th>
                  <th className="py-1 text-right">Заказов</th>
                  <th className="py-1 text-right">Выполнено</th>
                  <th className="py-1 text-right">Выручка, zł</th>
                </tr>
              </thead>
              <tbody>
                {overview.cities.map((c) => (
                  <tr key={c.name} className="border-t border-line">
                    <td className="py-1.5">{c.name}</td>
                    <td className="py-1.5 text-right">{c.orders}</td>
                    <td className="py-1.5 text-right">{c.completed}</td>
                    <td className="py-1.5 text-right">{money(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {details && (
        <Card surface>
          <h2 className="mb-3 text-lg font-semibold text-ink">
            Мастера и работы
          </h2>
          <AdminAnalyticsDetails data={details} />
        </Card>
      )}
    </div>
  );
}
