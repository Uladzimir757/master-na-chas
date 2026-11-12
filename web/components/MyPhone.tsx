"use client";

/**
 * «Мой номер для клиентов» в настройках кабинета (решение 12.11.2026):
 * номер и когда клиент его видит — всегда (в списке мастеров), после заказа
 * или после подтверждения. Сохраняется явной кнопкой.
 */

import { useEffect, useState } from "react";
import { api, type PhoneVisibility } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { isValidPhone } from "@/lib/phone";
import { CompactButton, inputClass } from "@/components/ui";

const OPTIONS: PhoneVisibility[] = ["always", "after_booking", "after_confirm"];

export default function MyPhone() {
  const { t } = useLocale();
  const [phone, setPhone] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<PhoneVisibility>("after_confirm");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getMySettings()
      .then((s) => {
        setPhone(s.phone ?? "");
        setVisibility(s.phone_visibility ?? "after_confirm");
      })
      .catch(() => setPhone(""));
  }, []);

  if (phone === null) return null;

  const label: Record<PhoneVisibility, string> = {
    always: t.myPhoneVisAlways,
    after_booking: t.myPhoneVisAfterBooking,
    after_confirm: t.myPhoneVisAfterConfirm,
  };

  const save = async () => {
    if (!isValidPhone(phone)) {
      setMessage({ ok: false, text: t.phoneInvalid });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const s = await api.updateMyPhone(phone.trim() || null, visibility);
      setPhone(s.phone ?? "");
      setMessage({ ok: true, text: t.myPhoneSaved });
    } catch {
      setMessage({ ok: false, text: t.myPhoneError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-ink-2">{t.myPhoneTitle}</h2>
      <input
        className={`${inputClass} mb-3 max-w-xs`}
        type="tel"
        placeholder={t.myPhonePlaceholder}
        value={phone}
        disabled={busy}
        onChange={(e) => {
          setMessage(null);
          setPhone(e.target.value);
        }}
      />
      <div className="mb-3 flex flex-col gap-1">
        {OPTIONS.map((v) => (
          <label key={v} className="flex min-h-10 items-center gap-2 text-base">
            <input
              type="radio"
              name="phone-visibility"
              className="h-5 w-5 accent-accent"
              checked={visibility === v}
              disabled={busy}
              onChange={() => {
                setMessage(null);
                setVisibility(v);
              }}
            />
            {label[v]}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <CompactButton type="button" disabled={busy} onClick={save}>
          {t.myPhoneSave}
        </CompactButton>
        {message && (
          <span className={`text-sm ${message.ok ? "text-ink-2" : "text-danger"}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
