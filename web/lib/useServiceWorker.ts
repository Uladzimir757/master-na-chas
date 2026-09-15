// Registers the PWA service worker (public/sw.js). A tiny standalone hook
// rather than inline in layout.tsx so RegisterServiceWorker.tsx and any
// future consumer (e.g. an "update available" banner) share one place that
// knows how registration works.
"use client";

import { useEffect } from "react";

export function useServiceWorkerRegistration(): void {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort — a failed registration (unsupported browser, private
        // mode blocking it, whatever) must never break the app itself.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
}
