// Registers the PWA service worker (public/sw.js). A tiny standalone hook
// rather than inline in layout.tsx so RegisterServiceWorker.tsx and any
// future consumer (e.g. an "update available" banner) share one place that
// knows how registration works.
"use client";

import { useEffect } from "react";

export function useServiceWorkerRegistration(): void {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    // The page was opened under an older worker (which served it from its
    // cache), and a new one has just taken over: reload once so the visitor
    // lands on the fresh version instead of the cached one. Not on a first
    // visit — there is no previous controller then, nothing stale to replace.
    const hadController = navigator.serviceWorker.controller !== null;
    let reloaded = false;
    const onControllerChange = () => {
      if (hadController && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort — a failed registration (unsupported browser, private
        // mode blocking it, whatever) must never break the app itself.
      });
    };

    const cleanup = () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );

    if (document.readyState === "complete") {
      register();
      return cleanup;
    }
    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      cleanup();
    };
  }, []);
}
