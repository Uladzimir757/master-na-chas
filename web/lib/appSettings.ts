/**
 * «Open settings» for the Android app when the microphone was refused twice
 * (Android then stops asking and getUserMedia fails straight away). A web
 * page can't open Android settings, so the app has a tiny native plugin
 * (android/app/src/main/java/pl/zr/app/AppSettingsPlugin.java). The site is
 * loaded from server.url, so the plugin isn't bundled here — Capacitor's
 * bridge injects it, the same way the geolocation plugin reaches the page.
 */

import { Capacitor } from "@capacitor/core";

type AppSettingsPlugin = { open: () => Promise<void> };

function plugin(): AppSettingsPlugin | null {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const p = plugins?.AppSettings as AppSettingsPlugin | undefined;
  return p && typeof p.open === "function" ? p : null;
}

export const canOpenAppSettings = (): boolean => plugin() !== null;

export async function openAppSettings(): Promise<void> {
  await plugin()?.open();
}
