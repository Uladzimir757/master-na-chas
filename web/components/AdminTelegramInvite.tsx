"use client";

/**
 * The one-time Telegram link for a master in the super-admin panel
 * (task 17.11.2026). Shown as selectable text with «Копировать» and, where
 * the device has a share sheet, «Отправить» — never as a link to open: the
 * Telegram chat binds to whoever presses «Start» first, so if the admin
 * opened it himself, the master's notifications would go to the admin.
 * The admin panel is Russian-only by decision — strings live here, not in
 * translation_entry.
 */

import { useRef, useState } from "react";

export function inviteText(link: string): string {
  return (
    `Podłącz powiadomienia o zamówieniach w Telegramie: ${link}\n` +
    `Подключи уведомления о заказах в Telegram: ${link}`
  );
}

const BUTTON =
  "inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold text-accent transition hover:border-accent";

export default function AdminTelegramInvite({ link }: { link: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const selectAll = () => inputRef.current?.select();

  const copy = async () => {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard permission (e.g. plain http, old WebView): leave the
      // text selected so the admin can copy it by hand
      selectAll();
      setCopyFailed(true);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ text: inviteText(link) });
    } catch {
      // the admin closed the share sheet — nothing to do
    }
  };

  return (
    <div className="mt-1 flex w-full flex-col gap-2">
      <input
        ref={inputRef}
        readOnly
        value={link}
        aria-label="Ссылка привязки Telegram"
        onFocus={selectAll}
        onClick={selectAll}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs break-all text-ink"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BUTTON} onClick={() => void copy()}>
          Копировать
        </button>
        {canShare && (
          <button type="button" className={BUTTON} onClick={() => void share()}>
            Отправить
          </button>
        )}
        {copied && <span className="text-sm text-accent-2">Скопировано</span>}
        {copyFailed && <span className="text-sm text-danger">Не удалось — скопируйте вручную</span>}
      </div>
      <p className="text-sm text-ink-2">
        Не открывай сам — Telegram привяжется к тому, кто первым нажмёт Start. Отправь мастеру.
      </p>
    </div>
  );
}
