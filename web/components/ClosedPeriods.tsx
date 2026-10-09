"use client";

/**
 * «Закрыть для записи»: мастер сам выбирает период (дни и часы), когда клиенты
 * не могут записаться — отпуск, выходной, поездка. Это те же блокировки
 * ProviderBlock, что и в календаре (они видны там же), просто с удобной
 * формой «с … по …» и быстрыми кнопками.
 */

import { useCallback, useEffect, useState } from "react";
import { api, type CalendarBlock } from "@/lib/api";
import { addDays, toDateParam, warsawIso } from "@/lib/format";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton, inputClass } from "@/components/ui";

const LOOKAHEAD_DAYS = 59;

/** "2026-10-12T09:30" (значение datetime-local) -> ISO со смещением Варшавы. */
function localToIso(v: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v);
  return m ? warsawIso(m[1], Number(m[2]), Number(m[3])) : null;
}

export default function ClosedPeriods() {
  const { t, locale } = useLocale();
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const today = new Date();
      const cal = await api.getMyCalendar(
        toDateParam(today),
        toDateParam(addDays(today, LOOKAHEAD_DAYS)),
      );
      setBlocks(
        [...cal.blocks].sort((a, b) => a.start_at.localeCompare(b.start_at)),
      );
    } catch {
      setBlocks([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const save = async (
    startIso: string | null,
    endIso: string | null,
    why?: string,
  ) => {
    if (!startIso || !endIso || Date.parse(endIso) <= Date.parse(startIso)) {
      setError(t.closedPeriodInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createBlock({
        start_at: startIso,
        end_at: endIso,
        reason: (why ?? reason).trim() || null,
      });
      setFrom("");
      setTo("");
      setReason("");
      await load();
    } catch {
      setError(t.closedPeriodError);
    } finally {
      setBusy(false);
    }
  };

  const today = new Date();
  const preset = (days: number, startsTomorrow: boolean) => {
    const start = startsTomorrow ? addDays(today, 1) : today;
    const end = addDays(start, days);
    const startIso = startsTomorrow
      ? warsawIso(toDateParam(start), 0, 0)
      : new Date(Math.ceil(Date.now() / 900_000) * 900_000).toISOString();
    return save(startIso, warsawIso(toDateParam(end), 0, 0), "");
  };

  const tag = locale === "pl" ? "pl-PL" : "en-GB";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Warsaw",
    }).format(new Date(iso));

  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-1 text-sm font-medium text-ink/60">
        {t.closedPeriodTitle}
      </h2>
      <p className="mb-3 text-sm text-ink/60">{t.closedPeriodHint}</p>

      <div className="mb-3 flex flex-wrap gap-2">
        <CompactButton
          variant="secondary"
          disabled={busy}
          onClick={() => preset(1, false)}
        >
          {t.closedPeriodRestOfToday}
        </CompactButton>
        <CompactButton
          variant="secondary"
          disabled={busy}
          onClick={() => preset(1, true)}
        >
          {t.closedPeriodTomorrow}
        </CompactButton>
        <CompactButton
          variant="secondary"
          disabled={busy}
          onClick={() => preset(7, true)}
        >
          {t.closedPeriodWeek}
        </CompactButton>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-ink/60">
          {t.closedPeriodFrom}
          <input
            type="datetime-local"
            step={900}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink/60">
          {t.closedPeriodTo}
          <input
            type="datetime-local"
            step={900}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <input
        type="text"
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t.closedPeriodReason}
        className={`mt-2 ${inputClass}`}
      />
      <div className="mt-2">
        <CompactButton
          disabled={busy || !from || !to}
          onClick={() => save(localToIso(from), localToIso(to))}
        >
          {t.closedPeriodSave}
        </CompactButton>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {blocks.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 text-sm">
          {blocks.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
            >
              <span>
                {fmt(b.start_at)} – {fmt(b.end_at)}
                {b.reason ? (
                  <span className="text-ink/60"> · {b.reason}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await api.deleteBlock(b.id).catch(() => {});
                  await load();
                }}
                className="shrink-0 text-danger underline"
              >
                {t.closedPeriodRemove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
