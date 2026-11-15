"use client";

/**
 * «Klient może sam zmienić lub anulować» в настройках кабинета (решение
 * 15.11.2026): за сколько до начала заказа клиент ещё может сам отменить
 * или перенести его онлайн. Максимум 3 часа. Раньше было общее правило
 * «2 часа» для всех мастеров. Сохраняется явной кнопкой.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton } from "@/components/ui";

const OPTIONS = [0, 30, 60, 90, 120, 180];

export default function ClientChangeLimit() {
  const { t } = useLocale();
  const [minutes, setMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getMySettings()
      .then((s) => setMinutes(s.client_change_min_minutes ?? 120))
      .catch(() => setMinutes(120));
  }, []);

  if (minutes === null) return null;

  const label = (m: number) => (m === 0 ? t.changeLimitUntilStart : t.changeLimitBefore(m));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const s = await api.updateClientChangeLimit(minutes);
      setMinutes(s.client_change_min_minutes ?? minutes);
      setMessage({ ok: true, text: t.myPhoneSaved });
    } catch {
      setMessage({ ok: false, text: t.jobAnswerError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-ink-2">{t.changeLimitTitle}</h2>
      <p className="mb-2 text-sm text-ink-2">{t.changeLimitHint}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            aria-pressed={minutes === m}
            onClick={() => {
              setMessage(null);
              setMinutes(m);
            }}
            className={`min-h-10 rounded-full border px-4 text-sm transition ${
              minutes === m ? "border-accent bg-accent text-on-accent" : "border-line text-ink hover:border-accent"
            }`}
          >
            {label(m)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <CompactButton type="button" disabled={busy} onClick={save}>
          {t.settingsSave}
        </CompactButton>
        {message && (
          <span className={`text-sm ${message.ok ? "text-ink-2" : "text-danger"}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
