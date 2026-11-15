"""POST /api/geocode — адрес клиента → точка для «расстояния до мастера»
(OSM Nominatim, app/geocode.py). Nominatim здесь подменён: реальных
запросов тесты не делают."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

import app.geocode as geocode_mod


class _FakeResponse:
    def __init__(self, rows, status=200):
        self._rows = rows
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("http error")

    def json(self):
        return self._rows


@pytest.fixture
def nominatim(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict] = []
    answer: dict = {"rows": [], "fail": False}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None, headers=None):
            calls.append({"url": url, "params": params, "headers": headers})
            if answer["fail"]:
                raise RuntimeError("network down")
            return _FakeResponse(answer["rows"])

    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(geocode_mod, "_MIN_INTERVAL_S", 0)
    geocode_mod._cache.clear()
    return calls, answer


async def test_address_found_is_rounded_and_then_cached(client: AsyncClient, nominatim):
    calls, answer = nominatim
    answer["rows"] = [{"lat": "54.518912", "lon": "18.530518"}]

    r = await client.post("/api/geocode", json={"address": "Morska 10, Gdynia"})
    assert r.status_code == 200, r.text
    assert r.json() == {"lat": 54.519, "lng": 18.531}
    # same address again (other spacing/case) — from the cache, no second request
    again = await client.post("/api/geocode", json={"address": "  morska 10,   GDYNIA "})
    assert again.json() == {"lat": 54.519, "lng": 18.531}
    assert len(calls) == 1
    # policy: our own User-Agent, Poland only
    assert "ZlotaRaczka" in calls[0]["headers"]["User-Agent"]
    assert calls[0]["params"]["countrycodes"] == "pl"


async def test_unknown_address_is_404(client: AsyncClient, nominatim):
    _, answer = nominatim
    answer["rows"] = []
    r = await client.post("/api/geocode", json={"address": "Nieistniejąca 999"})
    assert r.status_code == 404


async def test_geocoder_down_is_503(client: AsyncClient, nominatim):
    _, answer = nominatim
    answer["fail"] = True
    r = await client.post("/api/geocode", json={"address": "Morska 10, Gdynia"})
    assert r.status_code == 503


async def test_too_short_address_is_422(client: AsyncClient, nominatim):
    calls, _ = nominatim
    r = await client.post("/api/geocode", json={"address": "ab"})
    assert r.status_code == 422
    assert calls == []
