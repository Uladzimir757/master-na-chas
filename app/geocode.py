"""Address -> point for «distance to the master» when the client won't or
can't share their location (task 15.11.2026, part C, decision: free OSM
Nominatim).

Nominatim usage policy (operations.osmfoundation.org/policies/nominatim):
at most 1 request per second, an identifying User-Agent (not a library
default), results cached on our side, no autocomplete (we geocode only on an
explicit «Sprawdź» click), attribution shown next to the form. Requests go
only from the backend. The address itself is never logged or stored.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict

import httpx

from app.config import settings

logger = logging.getLogger("geocode")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Trójmiasto, a soft preference (bounded=0): «Morska 10» finds Gdynia's
# Morska first, but an address elsewhere in Poland still resolves.
VIEWBOX = "18.30,54.75,18.85,54.30"
_MIN_INTERVAL_S = 1.0
_CACHE_MAX = 2000

_cache: OrderedDict[str, tuple[float, float] | None] = OrderedDict()
_lock = asyncio.Lock()
_last_call = 0.0


class GeocoderUnavailable(Exception):
    """Nominatim didn't answer usably — the client is told to try later."""


def _key(address: str) -> str:
    return " ".join(address.lower().split())


def _remember(key: str, value: tuple[float, float] | None) -> None:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)


async def geocode(address: str) -> tuple[float, float] | None:
    """(lat, lng) rounded to 3 decimals (~100 m), or None if not found."""
    key = _key(address)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]

    global _last_call
    async with _lock:
        # one request at a time, at least a second apart (policy)
        wait = _MIN_INTERVAL_S - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
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
        except Exception as exc:
            logger.warning("geocode_failed: %s", type(exc).__name__)
            raise GeocoderUnavailable from exc
        finally:
            _last_call = time.monotonic()

    point = None
    if isinstance(rows, list) and rows:
        try:
            point = (round(float(rows[0]["lat"]), 3), round(float(rows[0]["lon"]), 3))
        except (KeyError, TypeError, ValueError):
            point = None
    _remember(key, point)
    return point
