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

import { useEffect, useRef } from "react";
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

  // Mount the map once, then just move the existing marker/view when
  // lat/lng change — recreating the whole map on every fix would flash and
  // lose the visitor's current zoom/pan.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      mapRef.current = L.map(containerRef.current, { zoomControl: false }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);

      const icon = L.divIcon({
        className: "",
        html: '<span class="block h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-md"></span>',
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

  return <div ref={containerRef} data-testid="provider-map" className={className ?? "h-40 w-full rounded-lg"} />;
}
