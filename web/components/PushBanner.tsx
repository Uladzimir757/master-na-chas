"use client";

/**
 * Пуш при открытом приложении. Android показывает FCM-уведомление только
 * когда приложение свёрнуто; на переднем плане оно приходит лишь в код
 * (lib/native.ts onForegroundPush) — без этого баннера мастер его не видел.
 * Тап открывает ссылку пуша (заказ в кабинете), крестик — закрывает.
 * Сам исчезает через 20 секунд. В браузере ничего не делает.
 */

import { useEffect, useState } from "react";
import { onForegroundPush, openPushUrl, type ForegroundPush } from "@/lib/native";

const AUTO_HIDE_MS = 20_000;

export function PushBanner() {
  const [push, setPush] = useState<ForegroundPush | null>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void onForegroundPush(setPush).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else off = unsubscribe;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    if (!push) return;
    const id = window.setTimeout(() => setPush(null), AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [push]);

  if (!push) return null;

  return (
    <div className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto max-w-md">
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            setPush(null);
            openPushUrl(push.url);
          }}
        >
          {push.title && <div className="font-semibold text-ink">{push.title}</div>}
          <div className="text-sm text-ink-2">{push.body}</div>
        </button>
        <button
          type="button"
          aria-label="×"
          className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-ink-3 hover:text-ink"
          onClick={() => setPush(null)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
