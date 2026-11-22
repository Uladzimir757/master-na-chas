"use client";

/** «Klienci»: карта клиента у мастера — история заказов, личные заметки и
 *  личный чёрный список. Видит только этот мастер; чёрный список лишь
 *  предупреждает о новом заказе, ничего не блокирует. Сохранение — явной
 *  кнопкой (как везде в кабинете). */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type BlockReason,
  type ClientCard,
  type ClientRow,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { Translations } from "@/lib/i18n";
import { CompactButton, inputClass } from "@/components/ui";

const REASONS: BlockReason[] = ["no_payment", "no_access", "rude", "other"];

function reasonLabel(t: Translations, r: string | null): string {
  switch (r) {
    case "no_payment":
      return t.clientReasonNoPayment;
    case "no_access":
      return t.clientReasonNoAccess;
    case "rude":
      return t.clientReasonRude;
    default:
      return t.clientReasonOther;
  }
}

export default function ClientsPanel() {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null); // телефон открытой карты

  const load = useCallback(() => {
    api
      .listClients()
      .then((r) => {
        setRows(r);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
        timeZone: "Europe/Warsaw",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [locale],
  );

  if (open) {
    return (
      <ClientCardView
        phone={open}
        dateFmt={dateFmt}
        onBack={() => {
          setOpen(null);
          load();
        }}
      />
    );
  }

  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = (rows ?? []).filter(
    (r) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      (digits !== "" && r.phone.includes(digits)),
  );

  return (
    <section>
      <p className="mb-3 text-sm text-ink-2">{t.clientsHint}</p>
      <input
        type="search"
        className={`${inputClass} mb-3`}
        placeholder={t.clientsSearch}
        aria-label={t.clientsSearch}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {error && <p className="text-sm text-danger">{t.clientsLoadError}</p>}
      {rows !== null && shown.length === 0 && !error && (
        <p className="text-sm text-ink-2">{t.clientsEmpty}</p>
      )}
      <ul className="flex flex-col gap-2">
        {shown.map((r) => (
          <li key={r.phone}>
            <button
              type="button"
              onClick={() => setOpen(r.phone)}
              className={`w-full rounded-lg border p-3 text-left ${
                r.blocked ? "border-danger/50 bg-danger/5" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{r.name}</span>
                {r.blocked && (
                  <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
                    {t.clientBlacklistBadge}
                  </span>
                )}
              </div>
              <div className="text-sm text-ink-2">{r.phone}</div>
              <div className="mt-1 text-xs text-ink-2">
                {t.clientStatOrders}: {r.orders} · {t.clientStatDone}:{" "}
                {r.completed} · {t.clientLastOrder}:{" "}
                {dateFmt.format(new Date(r.last_at))}
                {r.has_note ? " · 📝" : ""}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClientCardView({
  phone,
  dateFmt,
  onBack,
}: {
  phone: string;
  dateFmt: Intl.DateTimeFormat;
  onBack: () => void;
}) {
  const { t } = useLocale();
  const [card, setCard] = useState<ClientCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [asking, setAsking] = useState(false); // открыта форма «в чёрный список»
  const [reason, setReason] = useState<BlockReason>("no_payment");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .getClientCard(phone)
      .then((c) => {
        setCard(c);
        setNote(c.note ?? "");
        setError(null);
      })
      .catch(() => setError(t.clientsLoadError));
  }, [phone, t.clientsLoadError]);
  useEffect(load, [load]);

  async function saveNote() {
    setBusy(true);
    setNoteSaved(false);
    try {
      await api.saveClientNote(phone, note);
      setNoteSaved(true);
      setError(null);
    } catch {
      setError(t.clientSaveError);
    } finally {
      setBusy(false);
    }
  }

  async function setBlocked(blocked: boolean) {
    setBusy(true);
    try {
      await api.setClientBlacklist(phone, blocked, reason, comment);
      setAsking(false);
      setComment("");
      setError(null);
      load();
    } catch {
      setError(t.clientSaveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-sm font-semibold text-accent-2"
      >
        {t.clientBack}
      </button>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {!card && !error && <p className="text-sm text-ink-2">…</p>}
      {card && (
        <>
          <h2 className="text-lg font-semibold text-ink">
            {card.name || card.phone}
          </h2>
          <p className="mb-3 text-sm text-ink-2">{card.phone}</p>

          {card.blocked && (
            <div
              className="mb-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm"
              role="alert"
            >
              <p className="font-semibold text-danger">{t.clientOnBlacklist}</p>
              <p className="text-ink">{reasonLabel(t, card.block_reason)}</p>
              {card.block_comment && (
                <p className="mt-1 text-ink">«{card.block_comment}»</p>
              )}
            </div>
          )}

          <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-ink-2">{t.clientStatOrders}</dt>
              <dd className="font-semibold">{card.orders}</dd>
            </div>
            <div>
              <dt className="text-ink-2">{t.clientStatDone}</dt>
              <dd className="font-semibold">{card.completed}</dd>
            </div>
            <div>
              <dt className="text-ink-2">{t.clientStatCancelled}</dt>
              <dd className="font-semibold">{card.cancelled}</dd>
            </div>
            <div>
              <dt className="text-ink-2">{t.clientStatNoShow}</dt>
              <dd className="font-semibold">{card.no_show}</dd>
            </div>
            <div>
              <dt className="text-ink-2">{t.clientStatRevenue}</dt>
              <dd className="font-semibold">
                {Number(card.revenue).toFixed(2)}
              </dd>
            </div>
          </dl>

          <h3 className="mb-1 text-sm font-semibold text-ink">
            {t.clientNoteTitle}
          </h3>
          <textarea
            className={`${inputClass} min-h-24`}
            maxLength={1000}
            placeholder={t.clientNotePlaceholder}
            aria-label={t.clientNoteTitle}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteSaved(false);
            }}
          />
          <div className="mt-2 flex items-center gap-3">
            <CompactButton type="button" disabled={busy} onClick={saveNote}>
              {t.clientNoteSave}
            </CompactButton>
            {noteSaved && (
              <span className="text-sm text-accent-2">{t.clientNoteSaved}</span>
            )}
          </div>

          <h3 className="mb-1 mt-5 text-sm font-semibold text-ink">
            {t.clientBlacklistTitle}
          </h3>
          <p className="mb-2 text-xs text-ink-2">{t.clientBlacklistHint}</p>
          {card.blocked ? (
            <CompactButton
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setBlocked(false)}
            >
              {t.clientBlacklistRemove}
            </CompactButton>
          ) : asking ? (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <label className="text-sm text-ink-2">
                {t.clientBlacklistReasonLabel}
                <select
                  className={`${inputClass} mt-1`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value as BlockReason)}
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {reasonLabel(t, r)}
                    </option>
                  ))}
                </select>
              </label>
              <input
                className={inputClass}
                maxLength={300}
                placeholder={t.clientBlacklistCommentPlaceholder}
                aria-label={t.clientBlacklistCommentPlaceholder}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex gap-2">
                <CompactButton
                  type="button"
                  disabled={busy}
                  onClick={() => setBlocked(true)}
                >
                  {t.clientBlacklistConfirm}
                </CompactButton>
                <CompactButton
                  type="button"
                  variant="secondary"
                  onClick={() => setAsking(false)}
                >
                  {t.clientBlacklistCancel}
                </CompactButton>
              </div>
            </div>
          ) : (
            <CompactButton
              type="button"
              variant="secondary"
              onClick={() => setAsking(true)}
            >
              {t.clientBlacklistAdd}
            </CompactButton>
          )}

          <h3 className="mb-1 mt-5 text-sm font-semibold text-ink">
            {t.clientHistoryTitle}
          </h3>
          {card.history.length === 0 ? (
            <p className="text-sm text-ink-2">{t.clientHistoryEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {card.history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-line py-1"
                >
                  <span>
                    {dateFmt.format(new Date(h.start_at))} · {h.service_name}
                  </span>
                  <span className="text-ink-2">
                    {t.bookingStatusLabel[h.status]}
                    {h.price != null ? ` · ${Number(h.price).toFixed(2)} zł` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
