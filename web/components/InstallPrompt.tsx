"use client";

/**
 * Small dismissible bar offering to install the PWA. Two paths, because
 * only one of them has a programmatic API:
 * - Android/desktop Chrome (and other Chromium browsers) fire
 *   `beforeinstallprompt`; we capture it, suppress the browser's own mini-
 *   infobar, and show our own button that replays the captured prompt.
 * - iOS Safari never fires that event and has no install API at all —
 *   "Add to Home Screen" is a manual step under the native Share sheet, so
 *   we can only point at it with a text hint.
 * Already-installed visitors (display-mode: standalone) see nothing.
 * Dismissal is remembered per-browser (localStorage) so it doesn't nag on
 * every visit — best-effort, wrapped in try/catch since it's a per-viewer
 * convenience, not state anything else depends on.
 */

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { Button } from "@/components/ui";

const DISMISSED_KEY = "zr-install-prompt-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Best-effort only — a private window or blocked storage just means
    // the bar can reappear next visit, not a broken feature.
  }
}

export function InstallPrompt() {
  const { t, ready } = useLocale();
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true); // starts hidden until effects settle
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    // Wrapped in an IIFE, not called directly in the effect body — same
    // reason as LocaleContext.tsx/WorkingHoursEditor.tsx: these are one-time
    // reads of browser-only APIs (unavailable during the static-export
    // prerender), and react-hooks/set-state-in-effect flags direct setState
    // statements in an effect body regardless.
    (() => {
      setStandalone(window.matchMedia("(display-mode: standalone)").matches);
      setDismissed(readDismissed());
      setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    })();

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    persistDismissed();
    setDismissed(true);
  };

  const install = async () => {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  };

  const canShowAndroid = deferredEvent !== null;
  const canShowIos = isIos && !isIosStandaloneNavigator();

  if (!ready || standalone || dismissed || !(canShowAndroid || canShowIos)) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-line bg-bg px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      {canShowIos && <p className="text-sm text-ink">{t.installAppIosHint}</p>}
      <div className="flex shrink-0 items-center gap-2">
        {canShowAndroid && (
          <Button variant="primary" onClick={install} className="whitespace-nowrap">
            {t.installAppButton}
          </Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Zamknij"
          className="px-2 text-lg leading-none text-ink/60 hover:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// `navigator.standalone` is Safari-only (not in the DOM lib types), hence
// the cast — the safe way to check "already added to home screen" on iOS,
// since it doesn't support the `display-mode` media query the way Chromium
// does for this purpose.
function isIosStandaloneNavigator(): boolean {
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
