"use client";

import { useServiceWorkerRegistration } from "@/lib/useServiceWorker";

// Mounted once in app/layout.tsx. Pure side effect, renders nothing — kept
// as its own component (rather than calling the hook straight from
// RootLayout, a server component) since registering a service worker is
// client-only.
export function RegisterServiceWorker() {
  useServiceWorkerRegistration();
  return null;
}
