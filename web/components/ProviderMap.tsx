"use client";

/**
 * One pin on an OpenStreetMap tile layer — the master's live location
 * (Этап 4). Deliberately vanilla Leaflet, not react-leaflet: a single
 * marker doesn't need a React wrapper, and it sidesteps chasing
 * react-leaflet's React-19 compatibility. Leaflet reads `window` at import
 * time, which breaks Next's static-export prerender pass (Node, no DOM) if
 * imported at module scope — hence `await import("leaflet")` inside the
 * mount effect below rather than a top-level `import`.
 *
 * The marker is a plain Tailwind-styled dot (L.divIcon), not Leaflet's
 * default pin image — that default ships as separate PNG assets whose
 * paths need bundler-specific wiring to resolve correctly under Next's
 * static export; a CSS dot needs none of that and reads fine as "here's
 * roughly where the master is right now".
 */

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  lat: number;
  lng: number;
  className?: string;
}

export default function ProviderMap({ lat, lng, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  // «Na cały ekran» — the tester found the small map hard to read
  // (15.11.2026). A fixed overlay, not the Fullscreen API: iOS Safari
  // doesn't allow it on a <div>.
  const [full, setFull] = useState(false);
  const { t, ready } = useLocale();

  // Mount the map once, then just move the existing marker/view when
  // lat/lng change — recreating the whole map on every fix would flash and
  // lose the visitor's current zoom/pan.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // «+ / −» buttons: pinch alone wasn't discoverable (tester, 14.11.2026)
      mapRef.current = L.map(containerRef.current, { zoomControl: true }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);

      const icon = L.divIcon({
        className: "",
        html: '<span class="block h-4 w-4 rounded-full border-2 border-white bg-accent shadow-md"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      markerRef.current = L.marker([lat, lng], { icon }).addTo(mapRef.current);
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately mount-once: see the effect below for lat/lng updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setView([lat, lng]);
    markerRef.current?.setLatLng([lat, lng]);
  }, [lat, lng]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Leaflet measures its box once — after resizing tell it to look again,
  // keeping the master's dot in the middle.
  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      map.invalidateSize();
      map.setView([lat, lng]);
    }
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // lat/lng: only re-centre on toggle; the effect above follows the fix
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  return (
    // The size lives on this wrapper, never on the map's own div: Leaflet
    // adds its classes (leaflet-container…) to that div, and a changed
    // className from React wiped them — tiles shrank to 0 px in full screen.
    <div
      className={
        full
          ? "fixed inset-0 z-[1100] bg-bg"
          : `relative overflow-hidden ${className ?? "h-40 w-full rounded-lg"}`
      }
    >
      <div ref={containerRef} data-testid="provider-map" className="h-full w-full" />
      {ready && (
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          aria-label={full ? t.mapExitFullscreen : t.mapFullscreen}
          className={`absolute right-2 z-[1001] flex items-center gap-1.5 rounded-full border-2 border-accent bg-surface font-semibold text-accent-2 shadow-md ${
            full
              ? "top-[max(0.75rem,env(safe-area-inset-top))] min-h-11 px-4 text-base"
              : "top-2 min-h-10 px-3 text-sm"
          }`}
        >
          <span aria-hidden>{full ? "✕" : "⛶"}</span>
          {full ? t.mapExitFullscreen : t.mapFullscreen}
        </button>
      )}
    </div>
  );
}
