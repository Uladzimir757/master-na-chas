"use client";

/**
 * «Города, где я работаю» во вкладке настроек кабинета
 * (docs/confirm-timer-travel-cities-task.md): клиент видит мастера только в
 * отмеченных городах. Сохраняется явной кнопкой, минимум один город.
 */

import { useEffect, useState } from "react";
import { api, cityName, type MyCity } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton } from "@/components/ui";

export default function MyCities() {
  const { t, locale } = useLocale();
  const [cities, setCities] = useState<MyCity[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (list: MyCity[]) => {
    setCities(list);
    setPicked(new Set(list.filter((c) => c.selected).map((c) => c.id)));
  };

  useEffect(() => {
    api
      .getMyCities()
      .then(apply)
      .catch(() => setMessage({ ok: false, text: t.myCitiesError }));
    // t only feeds the error text; loading once is the point
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cities === null) return message ? <p className="text-sm text-danger">{message.text}</p> : null;

  const toggle = (id: string) => {
    setMessage(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (picked.size === 0) {
      setMessage({ ok: false, text: t.myCitiesMinOne });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      apply(await api.updateMyCities([...picked]));
      setMessage({ ok: true, text: t.myCitiesSaved });
    } catch {
      setMessage({ ok: false, text: t.myCitiesError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-ink-2">{t.myCitiesTitle}</h2>
      <p className="mb-3 text-sm text-ink-2">{t.myCitiesHint}</p>
      <div className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {cities.map((c) => (
          <label key={c.id} className="flex min-h-10 items-center gap-2 text-base">
            <input
              type="checkbox"
              className="h-5 w-5 accent-accent"
              checked={picked.has(c.id)}
              disabled={busy}
              onChange={() => toggle(c.id)}
            />
            {cityName(c, locale)}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <CompactButton type="button" disabled={busy} onClick={save}>
          {t.myCitiesSave}
        </CompactButton>
        {message && (
          <span className={`text-sm ${message.ok ? "text-ink-2" : "text-danger"}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
