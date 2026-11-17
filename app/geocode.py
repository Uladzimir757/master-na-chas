"""Address -> point for «distance to the master» when the client won't or
can't share their location (task 15.11.2026, part C).

Two free OpenStreetMap geocoders, asked only from the backend:
- Photon (photon.komoot.io) first — copes with real-life input like
  «Plac Dwóch Miast 1, Sopot 81-731», which Nominatim didn't find;
- Nominatim as the fallback. Its usage policy
  (operations.osmfoundation.org/policies/nominatim) also shapes how we ask
  both: one request per second, our own User-Agent, no autocomplete (only on
  the «Sprawdź» click), results cached here, Poland only, attribution shown
  next to the form. From Render's shared outgoing address Nominatim answered
  with HTTP errors on 17.11.2026 — hence Photon first.
The address itself is never logged or stored.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict

import httpx

from app.config import settings

logger = logging.getLogger("geocode")

PHOTON_URL = "https://photon.komoot.io/api/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Trójmiasto: Photon ranks results near this point first; for Nominatim a
# soft viewbox (bounded=0) does the same.
BIAS_LAT, BIAS_LNG = 54.47, 18.55
VIEWBOX = "18.30,54.75,18.85,54.30"
_MIN_INTERVAL_S = 1.0
_CACHE_MAX = 2000

_cache: OrderedDict[str, tuple[float, float] | None] = OrderedDict()
_lock = asyncio.Lock()
_last_call = 0.0


class GeocoderUnavailable(Exception):
    """Neither geocoder answered usably — the client is told to try later."""


def _key(address: str) -> str:
    return " ".join(address.lower().split())


def _remember(key: str, value: tuple[float, float] | None) -> None:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)


async def _photon(client: httpx.AsyncClient, address: str) -> tuple[float, float] | None:
    resp = await client.get(
        PHOTON_URL,
        params={"q": address, "limit": 5, "lat": BIAS_LAT, "lon": BIAS_LNG},
        headers={"User-Agent": settings.GEOCODER_USER_AGENT},
    )
    resp.raise_for_status()
    for f in resp.json().get("features", []):
        if (f.get("properties") or {}).get("countrycode", "").upper() != "PL":
            continue
        lng, lat = f["geometry"]["coordinates"][:2]
        return float(lat), float(lng)
    return None


async def _nominatim(client: httpx.AsyncClient, address: str) -> tuple[float, float] | None:
    resp = await client.get(
        NOMINATIM_URL,
        params={
            "q": address,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "pl",
            "viewbox": VIEWBOX,
            "bounded": 0,
            "accept-language": "pl",
        },
        headers={"User-Agent": settings.GEOCODER_USER_AGENT},
    )
    resp.raise_for_status()
    rows = resp.json()
    if isinstance(rows, list) and rows:
        return float(rows[0]["lat"]), float(rows[0]["lon"])
    return None


def _why(exc: Exception) -> str:
    # status code only — never the address (it's in the request URL)
    resp = getattr(exc, "response", None)
    return f"HTTP {resp.status_code}" if resp is not None else type(exc).__name__


async def geocode(address: str) -> tuple[float, float] | None:
    """(lat, lng) rounded to 3 decimals (~100 m), or None if not found."""
    key = _key(address)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]

    global _last_call
    async with _lock:
        # one outgoing request at a time, at least a second apart (policy)
        wait = _MIN_INTERVAL_S - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        point = None
        failures = 0
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                for name, source in (("photon", _photon), ("nominatim", _nominatim)):
                    try:
                        point = await source(client, address)
                    except Exception as exc:
                        failures += 1
                        logger.warning("geocode_failed source=%s: %s", name, _why(exc))
                        continue
                    if point is not None:
                        break
        finally:
            _last_call = time.monotonic()
        if point is None and failures == 2:
            raise GeocoderUnavailable

    if point is not None:
        point = (round(point[0], 3), round(point[1], 3))
    _remember(key, point)
    return point
