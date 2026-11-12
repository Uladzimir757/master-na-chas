"""Кэш публичного каталога (app/public_cache.py, docs/load-readiness.md):
города/мастера/услуги мастера отдаются из памяти до PUBLIC_CACHE_SECONDS,
сбрасываются после записей мастера и админа, но не после пинга геолокации."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import City, Provider, ProviderCity


async def _in_gdynia(db: AsyncSession, provider: Provider) -> City:
    gdynia = (await db.execute(select(City).where(City.slug == "gdynia"))).scalar_one()
    db.add(ProviderCity(provider_id=provider.id, city_id=gdynia.id))
    await db.commit()
    return gdynia


async def test_public_catalog_sends_cache_headers(client: AsyncClient, provider: Provider, db_session: AsyncSession):
    await _in_gdynia(db_session, provider)
    for url in ("/api/cities", "/api/providers?city=gdynia", f"/api/providers/{provider.id}/services"):
        resp = await client.get(url)
        assert resp.status_code == 200, url
        assert resp.headers["cache-control"] == "no-cache", url
        assert "app;dur=" in resp.headers["server-timing"]


async def test_slots_are_never_cached(client: AsyncClient, bookable_provider: Provider, service):
    resp = await client.get(
        f"/api/availability?service_id={service.id}&provider_id={bookable_provider.id}"
        "&date_from=2030-01-07&date_to=2030-01-07"
    )
    assert "public" not in resp.headers.get("cache-control", "")


async def test_cached_list_survives_a_direct_db_change(client: AsyncClient, provider: Provider, db_session: AsyncSession):
    await _in_gdynia(db_session, provider)
    first = (await client.get("/api/providers?city=gdynia")).json()

    provider.name = "Переименован напрямую в БД"
    await db_session.commit()

    assert (await client.get("/api/providers?city=gdynia")).json() == first


async def test_master_write_invalidates_the_cache(
    logged_in_client: AsyncClient, provider: Provider, db_session: AsyncSession
):
    await _in_gdynia(db_session, provider)
    assert (await logged_in_client.get("/api/providers?city=gdynia")).json()[0]["call_out_fee"] is None

    resp = await logged_in_client.patch(
        "/api/providers/me/settings", json={"call_out_fee": 55, "share_location": False}
    )
    assert resp.status_code == 200, resp.text
    assert (await logged_in_client.get("/api/providers?city=gdynia")).json()[0]["call_out_fee"] == 55


async def test_location_ping_keeps_the_cache(
    logged_in_client: AsyncClient, provider: Provider, db_session: AsyncSession
):
    await _in_gdynia(db_session, provider)
    first = (await logged_in_client.get("/api/providers?city=gdynia")).json()
    provider.name = "Новое имя"
    await db_session.commit()

    resp = await logged_in_client.put("/api/providers/me/location", json={"lat": 54.5, "lng": 18.5})
    assert resp.status_code in (200, 204), resp.text
    assert (await logged_in_client.get("/api/providers?city=gdynia")).json() == first
