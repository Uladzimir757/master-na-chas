"""Города мастера (docs/confirm-timer-travel-cities-task.md): клиент видит
только мастеров своего города, мастер задаёт свои города в кабинете,
суперадмин ведёт справочник."""

from __future__ import annotations

import uuid
from datetime import time

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import City, Provider, ProviderCity, Service, Tenant
from tests.test_bookings_api import _payload

ADMIN = {"X-Admin-Secret": settings.ADMIN_SECRET}


async def _city(db: AsyncSession, slug: str) -> City:
    return (await db.execute(select(City).where(City.slug == slug))).scalar_one()


@pytest_asyncio.fixture
async def gdynia(db_session: AsyncSession) -> City:
    return await _city(db_session, "gdynia")


@pytest_asyncio.fixture
async def sopot(db_session: AsyncSession) -> City:
    return await _city(db_session, "sopot")


@pytest_asyncio.fixture
async def provider_in_gdynia(db_session: AsyncSession, provider: Provider, gdynia: City) -> Provider:
    db_session.add(ProviderCity(provider_id=provider.id, city_id=gdynia.id))
    await db_session.commit()
    return provider


@pytest_asyncio.fixture
async def cityless_provider(db_session: AsyncSession, tenant: Tenant) -> Provider:
    row = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Без города", travel_buffer_minutes=0)
    db_session.add(row)
    await db_session.commit()
    return row


# ----------------------------------------------------------------------------
# публичная выдача
# ----------------------------------------------------------------------------


async def test_cities_list_only_cities_with_masters(client: AsyncClient, provider_in_gdynia: Provider):
    slugs = [c["slug"] for c in (await client.get("/api/cities")).json()]
    assert slugs == ["gdynia"]


async def test_providers_filtered_by_city(
    client: AsyncClient, provider_in_gdynia: Provider, cityless_provider: Provider
):
    in_gdynia = {p["id"] for p in (await client.get("/api/providers?city=gdynia")).json()}
    assert in_gdynia == {str(provider_in_gdynia.id)}
    assert (await client.get("/api/providers?city=sopot")).json() == []


async def test_master_without_cities_is_in_no_city(client: AsyncClient, cityless_provider: Provider, sopot: City):
    for slug in ("gdynia", "sopot", "gdansk"):
        ids = {p["id"] for p in (await client.get(f"/api/providers?city={slug}")).json()}
        assert str(cityless_provider.id) not in ids


async def test_inactive_city_hides_its_masters(
    client: AsyncClient, db_session: AsyncSession, provider_in_gdynia: Provider, gdynia: City
):
    gdynia.is_active = False
    await db_session.commit()
    assert (await client.get("/api/cities")).json() == []
    assert (await client.get("/api/providers?city=gdynia")).json() == []


# ----------------------------------------------------------------------------
# бронь в чужом городе
# ----------------------------------------------------------------------------


async def test_booking_in_a_city_the_master_doesnt_work_in_is_rejected(
    client: AsyncClient, bookable_provider: Provider, service: Service, provider_in_gdynia: Provider,
    gdynia: City, sopot: City,
):
    payload = _payload(service_id=service.id, provider_id=bookable_provider.id, start=time(10, 0))
    resp = await client.post("/api/bookings", json={**payload, "city_id": str(sopot.id)})
    assert resp.status_code == 422

    resp = await client.post("/api/bookings", json={**payload, "city_id": str(gdynia.id)})
    assert resp.status_code == 201, resp.text
    assert resp.json()["city_id"] == str(gdynia.id)


# ----------------------------------------------------------------------------
# кабинет мастера
# ----------------------------------------------------------------------------


async def test_master_sets_own_cities(
    logged_in_client: AsyncClient, provider_in_gdynia: Provider, gdynia: City, sopot: City
):
    mine = {c["slug"] for c in (await logged_in_client.get("/api/providers/me/cities")).json() if c["selected"]}
    assert mine == {"gdynia"}

    resp = await logged_in_client.put("/api/providers/me/cities", json={"city_ids": [str(sopot.id)]})
    assert resp.status_code == 200, resp.text
    assert {c["slug"] for c in resp.json() if c["selected"]} == {"sopot"}
    assert {p["id"] for p in (await logged_in_client.get("/api/providers?city=sopot")).json()} == {
        str(provider_in_gdynia.id)
    }


async def test_master_needs_at_least_one_city(logged_in_client: AsyncClient, provider_in_gdynia: Provider):
    resp = await logged_in_client.put("/api/providers/me/cities", json={"city_ids": []})
    assert resp.status_code == 422


async def test_master_cannot_pick_unknown_or_inactive_city(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider_in_gdynia: Provider, sopot: City
):
    assert (
        await logged_in_client.put("/api/providers/me/cities", json={"city_ids": [str(uuid.uuid4())]})
    ).status_code == 422
    sopot.is_active = False
    await db_session.commit()
    assert (
        await logged_in_client.put("/api/providers/me/cities", json={"city_ids": [str(sopot.id)]})
    ).status_code == 422


async def test_my_cities_only_change_my_own_provider(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider_in_gdynia: Provider,
    cityless_provider: Provider, sopot: City,
):
    await logged_in_client.put("/api/providers/me/cities", json={"city_ids": [str(sopot.id)]})
    others = (
        await db_session.execute(select(ProviderCity).where(ProviderCity.provider_id == cityless_provider.id))
    ).scalars().all()
    assert others == []


async def test_my_cities_require_login(client: AsyncClient):
    assert (await client.get("/api/providers/me/cities")).status_code == 401


# ----------------------------------------------------------------------------
# суперадмин
# ----------------------------------------------------------------------------


async def test_admin_creates_master_with_cities(client: AsyncClient, tenant: Tenant, gdynia: City, sopot: City):
    resp = await client.post(
        "/admin/masters",
        headers=ADMIN,
        json={
            "name": "Новый",
            "email": "new-master@example.com",
            "password": "password123",
            "city_ids": [str(gdynia.id), str(sopot.id)],
        },
    )
    assert resp.status_code == 200, resp.text
    masters = (await client.get("/admin/masters", headers=ADMIN)).json()
    row = next(m for m in masters if m["email"] == "new-master@example.com")
    assert set(row["city_ids"]) == {str(gdynia.id), str(sopot.id)}


async def test_admin_city_directory(client: AsyncClient, provider_in_gdynia: Provider):
    resp = await client.post(
        "/admin/cities", headers=ADMIN, json={"slug": "rumia", "name_pl": "Rumia", "name_en": "Rumia"}
    )
    assert resp.status_code == 201, resp.text
    city_id = resp.json()["id"]
    assert (
        await client.post("/admin/cities", headers=ADMIN, json={"slug": "rumia", "name_pl": "R", "name_en": "R"})
    ).status_code == 409

    resp = await client.patch(f"/admin/cities/{city_id}", headers=ADMIN, json={"is_active": False})
    assert resp.status_code == 200 and resp.json()["is_active"] is False
    assert "rumia" in {c["slug"] for c in (await client.get("/admin/cities", headers=ADMIN)).json()}
    assert (await client.get("/admin/cities")).status_code == 403
