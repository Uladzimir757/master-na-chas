"""POST /api/geocode — адрес клиента → точка для «расстояния до мастера»
(app/geocode.py: Photon, при сбое/пустом ответе — Nominatim). Обе службы
здесь подменены: реальных запросов тесты не делают."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

import app.geocode as geocode_mod


class _FakeResponse:
    def __init__(self, data, status=200):
        self._data = data
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._data


def _photon_feature(lat: float, lng: float, cc: str = "PL") -> dict:
    return {"properties": {"countrycode": cc}, "geometry": {"coordinates": [lng, lat]}}


@pytest.fixture
def services(monkeypatch: pytest.MonkeyPatch):
    """answers[service] = list of features/rows, or "fail" """
    calls: list[tuple[str, dict, dict]] = []
    answers: dict = {"photon": [], "nominatim": []}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None, headers=None):
            name = "photon" if "photon" in url else "nominatim"
            calls.append((name, params, headers))
            if answers[name] == "fail":
                raise RuntimeError("network down")
            if name == "photon":
                return _FakeResponse({"features": answers["photon"]})
            return _FakeResponse(answers["nominatim"])

    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(geocode_mod, "_MIN_INTERVAL_S", 0)
    geocode_mod._cache.clear()
    return calls, answers


async def test_photon_finds_it_rounded_and_cached(client: AsyncClient, services):
    calls, answers = services
    answers["photon"] = [_photon_feature(54.4267005, 18.5804482)]

    r = await client.post("/api/geocode", json={"address": "Plac Dwóch Miast 1, Sopot 81-731"})
    assert r.status_code == 200, r.text
    assert r.json() == {"lat": 54.427, "lng": 18.58}
    again = await client.post("/api/geocode", json={"address": "  plac dwóch miast 1,  sopot 81-731 "})
    assert again.json() == {"lat": 54.427, "lng": 18.58}
    assert [c[0] for c in calls] == ["photon"]  # once, and Nominatim not needed
    assert "ZlotaRaczka" in calls[0][2]["User-Agent"]


async def test_falls_back_to_nominatim_when_photon_has_nothing(client: AsyncClient, services):
    calls, answers = services
    answers["photon"] = [_photon_feature(52.0, 13.0, cc="DE")]  # not Poland — skipped
    answers["nominatim"] = [{"lat": "54.518912", "lon": "18.530518"}]
    r = await client.post("/api/geocode", json={"address": "Morska 10, Gdynia"})
    assert r.json() == {"lat": 54.519, "lng": 18.531}
    assert [c[0] for c in calls] == ["photon", "nominatim"]
    assert calls[1][1]["countrycodes"] == "pl"


async def test_falls_back_when_photon_is_down(client: AsyncClient, services):
    _, answers = services
    answers["photon"] = "fail"
    answers["nominatim"] = [{"lat": "54.5", "lon": "18.5"}]
    r = await client.post("/api/geocode", json={"address": "Morska 10, Gdynia"})
    assert r.status_code == 200


async def test_unknown_address_is_404(client: AsyncClient, services):
    r = await client.post("/api/geocode", json={"address": "Nieistniejąca 999"})
    assert r.status_code == 404


async def test_both_down_is_503(client: AsyncClient, services):
    _, answers = services
    answers["photon"] = answers["nominatim"] = "fail"
    r = await client.post("/api/geocode", json={"address": "Morska 10, Gdynia"})
    assert r.status_code == 503


async def test_too_short_address_is_422(client: AsyncClient, services):
    calls, _ = services
    r = await client.post("/api/geocode", json={"address": "ab"})
    assert r.status_code == 422
    assert calls == []
