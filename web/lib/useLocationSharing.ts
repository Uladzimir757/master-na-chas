"use client";

/**
 * Foreground-only GPS reporting for the cabinet (Этап 4 — "точка на карте").
 * Runs navigator.geolocation.watchPosition() only while `enabled` (bound to
 * ProviderSettings.share_location) is true AND this tab stays open and on
 * screen — there is no background/native equivalent for a website: iOS and
 * Android both require a real installed app with an OS-level "Always"
 * location permission for that, which a browser tab (even one "added to
 * home screen") cannot obtain. See Provider.share_location's docstring in
 * app/models.py for the full reasoning. The moment the master closes the
 * tab or locks the screen, watchPosition simply stops firing and the public
 * dot goes stale and disappears on its own once LOCATION_FRESHNESS
 * (app/slot_engine.py) elapses — nothing here needs to explicitly "turn
 * off" sharing on unmount beyond clearing the watch.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type LocationSharingStatus = "idle" | "waiting" | "active" | "denied" | "unsupported" | "error";

// Comfortably inside LOCATION_FRESHNESS (15 min server-side) so a normal
// ping cadence never lets the public dot go stale by itself.
const MIN_PING_INTERVAL_MS = 30_000;

export function useLocationSharing(enabled: boolean): LocationSharingStatus {
  const [status, setStatus] = useState<LocationSharingStatus>("idle");
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    // The three setStatus calls that decide *whether* to subscribe are
    // nested inside this IIFE (matching lib/LocaleContext.tsx's mount
    // effect) so they aren't direct statements in the effect body itself —
    // react-hooks/set-state-in-effect only flags the latter. The actual
    // subscription/cleanup below is unaffected either way: its own setState
    // calls already live inside watchPosition's own callbacks, not the
    // effect body.
    const supported = "geolocation" in navigator;
    (() => {
      if (!enabled) {
        setStatus("idle");
      } else if (!supported) {
        setStatus("unsupported");
      } else {
        setStatus("waiting");
      }
    })();

    if (!enabled || !supported) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setStatus("active");
        const now = Date.now();
        if (now - lastSentAtRef.current < MIN_PING_INTERVAL_MS) return;
        lastSentAtRef.current = now;
        api.updateMyLocation(position.coords.latitude, position.coords.longitude).catch(() => {
          // Best-effort: a single failed ping isn't worth surfacing to the
          // master — the next watchPosition callback (or, failing that,
          // the server-side freshness gate) recovers on its own.
        });
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: false, maximumAge: 20_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return status;
}
