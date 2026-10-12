"use client";

import { useEffect } from "react";
import { installPushTapHandler } from "@/lib/native";
import { useServiceWorkerRegistration } from "@/lib/useServiceWorker";

// Mounted once in app/layout.tsx. Pure side effect, renders nothing — kept
// as its own component (rather than calling the hook straight from
// RootLayout, a server component) since registering a service worker is
// client-only.
export function RegisterServiceWorker() {
  useServiceWorkerRegistration();
  // Нативное приложение: тап по FCM-уведомлению открывает его ссылку
  // (no-op в браузере, lib/native.ts).
  useEffect(() => {
    void installPushTapHandler();
  }, []);
  return null;
}
