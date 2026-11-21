"use client";

/** Модерация отзывов суперадмином (защита рейтинга от накрутки): список
 *  отзывов с подсказками «подозрительно» и кнопкой «Скрыть» — скрытый отзыв
 *  пропадает из публичного списка и из рейтинга мастера. Подсказки —
 *  наводка, а не приговор: решает человек. */

import { useCallback, useEffect, useState } from "react";
import { api, type AdminMaster, type AdminReview } from "@/lib/api";
import { Card, CompactButton } from "@/components/ui";

const FLAG_LABEL: Record<string, string> = {
  repeat_phone: "тот же номер оставил этому мастеру несколько отзывов",
  quick_cycle: "отзыв пришёл меньше чем через час после создания заказа",
  master_phone: "номер клиента совпадает с номером мастера",
  by_master: "заказ внёс сам мастер",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminReviews({
  masters,
  onChanged,
}: {
  masters: AdminMaster[] | null;
  onChanged?: () => void; // рейтинг мастера изменился — обновить список мастеров
}) {
  const [providerId, setProviderId] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [rows, setRows] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminListReviews(providerId || undefined)
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch(() => setError("Не удалось загрузить отзывы"));
  }, [providerId]);

  useEffect(load, [load]);

  async function toggle(r: AdminReview) {
    setBusy(r.id);
    try {
      await api.adminSetReviewHidden(r.id, !r.hidden);
      load();
      onChanged?.();
    } catch {
      setError("Не получилось изменить отзыв — попробуйте ещё раз");
    } finally {
      setBusy(null);
    }
  }

  const shown = (rows ?? []).filter((r) => !onlyFlagged || r.flags.length > 0);

  return (
    <Card>
      <h2 className="mb-3 text-lg font-medium">Отзывы</h2>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <select
          aria-label="Мастер для отзывов"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-ink"
        >
          <option value="">Все мастера</option>
          {(masters ?? []).map((m) => (
            <option key={m.provider_id} value={m.provider_id}>
              {m.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-ink-2">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          Только с подсказками
        </label>
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {rows !== null && shown.length === 0 && (
        <p className="text-sm text-ink-2">Отзывов нет.</p>
      )}
      <div className="flex flex-col gap-3">
        {shown.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border p-3 text-sm ${
              r.hidden ? "border-line opacity-60" : "border-line"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b>{r.provider_name}</b>{" "}
                <span className="text-amber">
                  {"★".repeat(r.rating)}
                  <span className="text-ink/20">{"★".repeat(5 - r.rating)}</span>
                </span>
                {r.hidden && <span className="ml-2 text-ink-3">(скрыт)</span>}
              </div>
              <CompactButton
                type="button"
                variant="secondary"
                disabled={busy === r.id}
                onClick={() => toggle(r)}
              >
                {r.hidden ? "Вернуть" : "Скрыть"}
              </CompactButton>
            </div>
            <div className="mt-1 text-xs text-ink-2">
              {r.client_name ?? "—"}
              {r.phone_tail ? ` · …${r.phone_tail}` : ""} · отзыв{" "}
              {when(r.created_at)}
              {r.booking_created_at
                ? ` · заказ создан ${when(r.booking_created_at)}`
                : ""}
              {r.photos ? ` · фото: ${r.photos}` : ""}
            </div>
            {r.text && <p className="mt-1 text-ink">{r.text}</p>}
            {r.flags.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-danger">
                {r.flags.map((f) => (
                  <li key={f}>{FLAG_LABEL[f] ?? f}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
