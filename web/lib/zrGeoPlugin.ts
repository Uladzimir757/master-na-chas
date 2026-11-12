/**
 * Свой нативный плагин приложения для фоновой геолокации (только Android):
 * android/app/src/main/java/pl/zr/app/GeoRestartPlugin.java. Один
 * registerPlugin на всё приложение — повторная регистрация того же имени
 * Capacitor не любит.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface KeepAliveStatus {
  /** приложение в списке «без ограничений батареи» */
  batteryUnrestricted: boolean;
  /** Xiaomi/Redmi/POCO — у них есть отдельный «Автозапуск» */
  xiaomi: boolean;
}

export const ZrGeoRestart = registerPlugin<{
  setShouldShare(options: { value: boolean }): Promise<void>;
  keepAliveStatus(): Promise<KeepAliveStatus>;
  requestBatteryExemption(): Promise<void>;
  openAutostartSettings(): Promise<{ opened: boolean }>;
}>("ZrGeoRestart");

export const isAndroidApp = () => Capacitor.getPlatform() === "android";
