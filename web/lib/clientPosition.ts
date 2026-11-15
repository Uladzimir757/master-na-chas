/**
 * The client's own position for «distance to the master» (task 15.11.2026,
 * part C). Asked only on an explicit action (the «Pokaż odległość» button,
 * or «by my location» in the city picker), rounded to 3 decimals (~100 m)
 * before it is stored or sent, kept only in this browser's localStorage —
 * never saved on the server. Can be cleared («Ukryj odległość»).
 */

export type ClientPos = { lat: number; lng: number };

const KEY = "zr_client_pos";

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function savedClientPos(): ClientPos | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ClientPos;
    return typeof p?.lat === "number" && typeof p?.lng === "number" ? p : null;
  } catch {
    return null;
  }
}

export function saveClientPos(lat: number, lng: number): ClientPos {
  const p = { lat: round3(lat), lng: round3(lng) };
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // private mode / blocked storage — the distance just isn't remembered
  }
  return p;
}

export function clearClientPos(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** Ask the browser once. enableHighAccuracy: on this project's Xiaomi WebView
 * low accuracy never answers (CLAUDE.md, checked 12.11.2026). */
export function locateClient(): Promise<ClientPos> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(saveClientPos(pos.coords.latitude, pos.coords.longitude)),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5 * 60_000 },
    );
  });
}
