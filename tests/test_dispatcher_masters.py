"""GET /api/dispatcher/masters — our masters for the dispatcher (a separate
project that shows them before Google Places). See app/main.py's
dispatcher_masters and docs/decisions.md, «Диспетчер».
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Provider, ProviderService, Service, Tenant

GDYNIA = {"lat": 54.519, "lng": 18.531}
WARSAW = {"lat": 52.23, "lng": 21.01}


async def _master(db: AsyncSession, tenant: Tenant, name: str, category: str, rating: str | None = None) -> Provider:
    service = Service(id=uuid.uuid4(), tenant_id=tenant.id, name=f"{name} job", duration_minutes=60, category=category)
    provider = Provider(
        id=uuid.uuid4(), tenant_id=tenant.id, name=name, rating=Decimal(rating) if rating else None, rating_count=3
    )
    db.add_all([service, provider])
    await db.flush()
    db.add(ProviderService(provider_id=provider.id, service_id=service.id, is_active=True))
    await db.commit()
    return provider


@pytest_asyncio.fixture
async def masters(db_session: AsyncSession, tenant: Tenant) -> dict[str, Provider]:
    return {
        "plumber": await _master(db_session, tenant, "Hydraulik", "plumbing", "4.5"),
        "electrician": await _master(db_session, tenant, "Elektryk", "electric", "4.9"),
    }


async def test_handyman_near_gdynia_lists_masters_best_rated_first(client: AsyncClient, masters):
    r = await client.get("/api/dispatcher/masters", params={"category": "handyman", **GDYNIA})
    assert r.status_code == 200
    body = r.json()
    assert [m["name"] for m in body] == ["Elektryk", "Hydraulik"]
    assert body[0]["reviews"] == 3
    assert body[0]["url"].endswith("/")
    # no live location shared -> no point, the dispatcher shows no distance
    assert body[0]["lat"] is None and body[0]["phone"] is None


async def test_subcategory_narrows_to_that_trade(client: AsyncClient, masters):
    r = await client.get("/api/dispatcher/masters", params={"category": "handyman", "subcategory": "plumbing", **GDYNIA})
    assert [m["name"] for m in r.json()] == ["Hydraulik"]


async def test_subcategory_we_dont_have_does_not_narrow(client: AsyncClient, masters):
    r = await client.get("/api/dispatcher/masters", params={"category": "handyman", "subcategory": "painting", **GDYNIA})
    assert len(r.json()) == 2


async def test_other_category_or_far_away_is_empty(client: AsyncClient, masters):
    other = await client.get("/api/dispatcher/masters", params={"category": "auto_repair", **GDYNIA})
    far = await client.get("/api/dispatcher/masters", params={"category": "handyman", **WARSAW})
    assert other.json() == [] and far.json() == []


async def test_city_without_position(client: AsyncClient, masters):
    near = await client.get("/api/dispatcher/masters", params={"category": "handyman", "city": "Sopot"})
    far = await client.get("/api/dispatcher/masters", params={"category": "handyman", "city": "Warsaw"})
    nowhere = await client.get("/api/dispatcher/masters", params={"category": "handyman"})
    assert len(near.json()) == 2
    assert far.json() == [] and nowhere.json() == []


async def test_inactive_master_or_offer_is_left_out(client: AsyncClient, db_session: AsyncSession, masters):
    masters["plumber"].is_active = False
    await db_session.commit()
    r = await client.get("/api/dispatcher/masters", params={"category": "handyman", **GDYNIA})
    assert [m["name"] for m in r.json()] == ["Elektryk"]


async def test_phone_set_in_admin_reaches_the_dispatcher(client: AsyncClient, db_session: AsyncSession, masters):
    masters["electrician"].phone = "+48 600 100 200"
    await db_session.commit()
    r = await client.get("/api/dispatcher/masters", params={"category": "handyman", **GDYNIA})
    assert r.json()[0]["phone"] == "+48 600 100 200"
    # the public master list still has no phone
    public = await client.get("/api/providers")
    assert all("phone" not in p for p in public.json())
