"use client";

/**
 * «Чтобы геолокация не выключалась» — в настройках кабинета, только в
 * Android-приложении и пока мастер делится местоположением (решение
 * пользователя 12.11.2026).
 *
 * Xiaomi/HyperOS убивает приложение вместе с сервисом геолокации, когда его
 * смахивают из недавних. Сами настройки приложение включить не может —
 * Android и Xiaomi это запрещают, — поэтому кнопки ведут прямо туда:
 * системный запрос «без ограничений батареи» (его состояние видно) и экран
 * «Автозапуск» Xiaomi (его состояние Xiaomi не отдаёт). Плюс подсказка про
 * замок в недавних. Запасной путь на сервере — app/geo_watchdog.py.
 */

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { CompactButton } from "@/components/ui";
import { isAndroidApp, ZrGeoRestart, type KeepAliveStatus } from "@/lib/zrGeoPlugin";

export default function GeoKeepAlive() {
  const { t } = useLocale();
  const [status, setStatus] = useState<KeepAliveStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!isAndroidApp()) return;
    try {
      setStatus(await ZrGeoRestart.keepAliveStatus());
    } catch {
      setStatus(null); // старая сборка APK без этих методов
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    // вернулся из системных настроек — перечитать
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  if (!status) return null;

  return (
    <div className="mt-3 rounded-xl border border-line-soft bg-bg p-3 text-sm">
      <p className="text-ink-2">{t.geoKeepAliveHint}</p>
      <ul className="mt-2 flex flex-col gap-2">
        <li>
          {status.batteryUnrestricted ? (
            <span className="text-ink">✓ {t.geoKeepAliveBatteryOk}</span>
          ) : (
            <CompactButton onClick={() => void ZrGeoRestart.requestBatteryExemption().catch(() => {})}>
              {t.geoKeepAliveBattery}
            </CompactButton>
          )}
        </li>
        {status.xiaomi && (
          <li>
            <CompactButton
              variant="secondary"
              onClick={() => void ZrGeoRestart.openAutostartSettings().catch(() => {})}
            >
              {t.geoKeepAliveAutostart}
            </CompactButton>
            <span className="mt-1 block text-ink-2">{t.geoKeepAliveAutostartHint}</span>
          </li>
        )}
        <li className="text-ink-2">{t.geoKeepAliveLock}</li>
      </ul>
    </div>
  );
}
