"use client";

/**
 * GPS reporting for the cabinet (Этап 4 — "точка на карте"), two sources:
 *
 * - Browser: navigator.geolocation.watchPosition(), foreground-only — it
 *   runs only while `enabled` (bound to ProviderSettings.share_location) is
 *   true AND this tab stays open and on screen. A website can't do better:
 *   iOS and Android both require a real installed app with an OS-level
 *   "Always" location permission for background location, which a browser
 *   tab (even one "added to home screen") cannot obtain. The moment the
 *   master closes the tab or locks the screen, watchPosition simply stops
 *   firing and the public dot goes stale and disappears on its own once
 *   LOCATION_FRESHNESS (app/slot_engine.py) elapses.
 *
 * - Native app (Capacitor, docs/mobile-app-task.md §5):
 *   @capgo/background-geolocation with a background notification (Android
 *   foreground service) / "Always" authorization (iOS). Fixes are POSTed by
 *   the plugin's own native code straight to the same
 *   /api/providers/me/location (StartOptions.url) — not from JS, because a
 *   backgrounded WebView gets suspended (iOS) or network-throttled
 *   (Android) while native code keeps running. The server side — storage
 *   and the three publication gates — is identical for both sources.
 *
 * Either way nothing here needs to explicitly "turn off" sharing beyond
 * stopping the watch: the freshness gate hides the dot by itself.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, api } from "@/lib/api";
import { getToken } from "@/lib/authToken";
import { isNativeApp } from "@/lib/native";

export type LocationSharingStatus = "idle" | "waiting" | "active" | "denied" | "unsupported" | "error";

// Comfortably inside LOCATION_FRESHNESS (15 min server-side) so a normal
// ping cadence never lets the public dot go stale by itself.
const MIN_PING_INTERVAL_MS = 30_000;

/** Text of the persistent Android notification while sharing runs in the background. */
export interface BackgroundNotificationText {
  title: string;
  message: string;
}

export interface LocationSharing {
  status: LocationSharingStatus;
  /**
   * Native app only: tracking runs, but the OS hasn't granted "Always"
   * yet. Android grants it only as a separate step (system settings, since
   * Android 11) — without it the foreground service still works while
   * started from the app, but can't be restarted by the system after the
   * process is killed; iOS stops background updates under "While using".
   */
  needsAlways: boolean;
  /** Opens the OS "Always" request / app location settings. */
  requestAlways: () => void;
}

type BackgroundGeolocationPlugin =
  (typeof import("@capgo/background-geolocation"))["BackgroundGeolocation"];

// One native service per app, so start/stop must never interleave: a quick
// toggle, React StrictMode's double effect in dev, or a re-render would
// otherwise race stop() of one session against start() of the next.
let nativeQueue: Promise<unknown> = Promise.resolve();

function runNative<T>(job: (plugin: BackgroundGeolocationPlugin) => Promise<T>): Promise<T> {
  const next = nativeQueue.then(async () => {
    const { BackgroundGeolocation } = await import("@capgo/background-geolocation");
    return job(BackgroundGeolocation);
  });
  nativeQueue = next.catch(() => {});
  return next;
}

// Android-only native flag "the master is sharing location"
// (android/app/src/main/java/pl/zr/app/GeoRestartPlugin.java). The app's
// BootReceiver and MainActivity.onResume read it to bring the plugin's
// service back after the process was killed — the plugin itself doesn't
// (docs/geo-service-restart-task.md).
const ZrGeoRestart = registerPlugin<{
  setShouldShare(options: { value: boolean }): Promise<void>;
}>("ZrGeoRestart");

async function setShouldShare(value: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;
  await ZrGeoRestart.setShouldShare({ value }).catch(() => {});
}

/**
 * Explicit end of sharing in the native app — the master turned the toggle
 * off or logged out. Stops the service and clears the restart flag, so
 * neither a reboot nor reopening the app brings it back.
 */
export function stopNativeLocationSharing(): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  return runNative(async (BackgroundGeolocation) => {
    await setShouldShare(false);
    await BackgroundGeolocation.stop().catch(() => {});
  }).catch(() => {});
}

async function checkNeedsAlways(): Promise<boolean> {
  const { BackgroundGeolocation } = await import("@capgo/background-geolocation");
  const perm = await BackgroundGeolocation.checkPermissions();
  return perm.backgroundLocation !== undefined && perm.backgroundLocation !== "granted";
}

/**
 * @param enabled ProviderSettings.share_location, or null while settings
 *     haven't loaded yet. The distinction matters in the native app, where
 *     false *stops* the background service — it must not be mistaken for
 *     "not known yet" on every cabinet open.
 */
export function useLocationSharing(
  enabled: boolean | null,
  notification: BackgroundNotificationText,
): LocationSharing {
  const [status, setStatus] = useState<LocationSharingStatus>("idle");
  const [needsAlways, setNeedsAlways] = useState(false);
  const lastSentAtRef = useRef(0);
  // Read at start time only — a language switch mid-session shouldn't
  // restart tracking just to re-word the notification.
  const notificationRef = useRef(notification);
  useEffect(() => {
    notificationRef.current = notification;
  }, [notification]);

  useEffect(() => {
    // The three setStatus calls that decide *whether* to subscribe are
    // nested inside this IIFE (matching lib/LocaleContext.tsx's mount
    // effect) so they aren't direct statements in the effect body itself —
    // react-hooks/set-state-in-effect only flags the latter. The actual
    // subscription/cleanup below is unaffected either way: its own setState
    // calls already live inside the watch callbacks, not the effect body.
    const native = isNativeApp();
    const supported = native || "geolocation" in navigator;
    (() => {
      if (!enabled) {
        setStatus("idle");
      } else if (!supported) {
        setStatus("unsupported");
      } else {
        setStatus("waiting");
      }
    })();

    if ((!enabled && !native) || !supported) return undefined;

    const sendFromJs = (lat: number, lng: number) => {
      const now = Date.now();
      if (now - lastSentAtRef.current < MIN_PING_INTERVAL_MS) return;
      lastSentAtRef.current = now;
      api.updateMyLocation(lat, lng).catch(() => {
        // Best-effort: a single failed ping isn't worth surfacing to the
        // master — the next fix (or, failing that, the server-side
        // freshness gate) recovers on its own.
      });
    };

    if (native) {
      if (enabled === null) return undefined;
      if (!enabled) {
        void stopNativeLocationSharing();
        return undefined;
      }
      let cancelled = false;
      const bearer = getToken("master");
      void runNative(async (BackgroundGeolocation) => {
        if (cancelled) return;
        // The native service outlives the page: after a reload (no React
        // cleanup runs) or a WebView restart it is still running, and a
        // second start() fails with ALREADY_STARTED. Restart it instead —
        // which also re-attaches this page's callback and current token.
        await BackgroundGeolocation.stop().catch(() => {});
        await BackgroundGeolocation.start(
          {
            backgroundTitle: notificationRef.current.title,
            backgroundMessage: notificationRef.current.message,
            requestPermissions: true,
            stale: false,
            // 0 + minIntervalMs: periodic points even while parked at a job
            // (a distance filter would go silent and let the dot go stale).
            distanceFilter: 0,
            minIntervalMs: MIN_PING_INTERVAL_MS,
            // Native delivery needs the Bearer token (no cookies there). It
            // is always set after a login inside the app (lib/api.ts); if it
            // somehow isn't, fall back to sending from JS below.
            ...(bearer
              ? {
                  url: `${API_URL}/api/providers/me/location`,
                  headers: { Authorization: `Bearer ${bearer}` },
                }
              : {}),
          },
          (location, error) => {
            if (cancelled) return;
            if (error) {
              setStatus(error.code === "NOT_AUTHORIZED" ? "denied" : "error");
              return;
            }
            checkNeedsAlways().then(setNeedsAlways, () => {});
            if (!location) return;
            setStatus("active");
            if (!bearer) sendFromJs(location.latitude, location.longitude);
          },
        );
        // Only native delivery (url) survives without the WebView, so only
        // then is a native restart meaningful.
        await setShouldShare(Boolean(bearer));
      }).catch(() => {
        if (!cancelled) setStatus("error");
      });
      // No stop() on unmount: in the app the service is meant to outlive the
      // cabinet page (the master browses elsewhere, the app is backgrounded).
      // Only an explicit off — enabled turning false, or logout
      // (stopNativeLocationSharing) — ends it.
      return () => {
        cancelled = true;
      };
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setStatus("active");
        sendFromJs(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: false, maximumAge: 20_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  const requestAlways = useCallback(() => {
    (async () => {
      const { BackgroundGeolocation } = await import("@capgo/background-geolocation");
      const perm = await BackgroundGeolocation.requestPermissions({
        permissions: ["backgroundLocation"],
      });
      if (perm.backgroundLocation === "granted") setNeedsAlways(false);
      // Denied for good (or Android routed nowhere) — settings are the
      // only place left to grant it.
      else await BackgroundGeolocation.openSettings();
    })().catch(() => {});
  }, []);

  return { status, needsAlways: Boolean(enabled) && needsAlways, requestAlways };
}
