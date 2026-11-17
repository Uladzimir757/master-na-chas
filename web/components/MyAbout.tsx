"use client";

/**
 * «O mnie» в настройках кабинета (17.11.2026): несколько слов о себе —
 * клиент видит их в профиле мастера рядом с отзывами
 * (components/MasterProfile.tsx). До 600 знаков, явная кнопка «Zapisz».
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton, inputClass } from "@/components/ui";

const MAX = 600;

export default function MyAbout() {
  const { t } = useLocale();
  const [about, setAbout] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getMySettings()
      .then((s) => setAbout(s.about ?? ""))
      .catch(() => setAbout(""));
  }, []);

  if (about === null) return null;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const s = await api.updateMyAbout(about.trim() || null);
      setAbout(s.about ?? "");
      setMessage({ ok: true, text: t.myPhoneSaved });
    } catch {
      setMessage({ ok: false, text: t.jobAnswerError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-ink-2">{t.myAboutTitle}</h2>
      <p className="mb-2 text-sm text-ink-2">{t.myAboutHint}</p>
      <textarea
        className={`${inputClass} mb-1`}
        rows={4}
        maxLength={MAX}
        placeholder={t.myAboutPlaceholder}
        value={about}
        disabled={busy}
        onChange={(e) => {
          setMessage(null);
          setAbout(e.target.value);
        }}
      />
      <div className="mb-3 text-right text-xs text-ink-2">
        {about.length}/{MAX}
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
