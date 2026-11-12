"use client";

/**
 * «Уведомления на этом телефоне» во вкладке настроек кабинета — только в
 * приложении. Показывает итог последней попытки включить пуши
 * (lib/native.ts registerNativePush): включены / запрещены в телефоне /
 * текст ошибки, и кнопку повторить. Регистрация молча падала, и снаружи
 * было не понять почему.
 */

import { useState } from "react";
import type { PushStatus as Status } from "@/lib/native";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton } from "@/components/ui";

export default function PushStatus({
  status,
  onRetry,
}: {
  status: Status | null;
  onRetry: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);

  // Всё в порядке (или ещё проверяем) — блока нет: это была просто
  // информация (решение пользователя 12.11.2026). Виден только при проблеме.
  if (status === null || status.state === "registered") return null;

  const text =
    status.state === "denied"
      ? t.pushStatusDenied
      : status.state === "unavailable"
        ? t.pushStatusUnavailable
        : t.pushStatusError(status.message);

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-ink-2">{t.pushStatusTitle}</h2>
      <p className="mb-2 text-sm text-danger" role="status">
        {text}
      </p>
      <CompactButton
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRetry();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.pushEnableButton}
        </CompactButton>
    </div>
  );
}
