"""Свои услуги мастера (docs/редактирование, выбрать и удалить у.txt):
стандартные услуги каталога есть у каждого мастера всегда, мастер может
переименовать их (создаётся его собственная копия), убрать из своего списка
(каталог для остальных не меняется, можно вернуть) и создать свои.
"""

from __future__ import annotations

import uuid
from datetime import time

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Provider, Service, Tenant
from tests.test_bookings_api import _payload


@pytest_asyncio.fixture
async def other_provider(db_session: AsyncSession, tenant: Tenant) -> Provider:
    row = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Другой", travel_buffer_minutes=0)
    db_session.add(row)
    await db_session.commit()
    return row


def _by_name(rows: list[dict]) -> dict[str, dict]:
    return {r["name"]: r for r in rows}


async def _create(client: AsyncClient, **overrides) -> list[dict]:
    body = {"name": "Монтаж полок на заказ", "duration_minutes": 90, "price_min": 150, "category": "assembly"}
    resp = await client.post("/api/providers/me/services/custom", json={**body, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ----------------------------------------------------------------------------
# создание своей услуги
# ----------------------------------------------------------------------------


async def test_new_master_sees_standard_services(logged_in_client: AsyncClient, service: Service):
    rows = (await logged_in_client.get("/api/providers/me/services")).json()
    row = _by_name(rows)[service.name]
    assert row["is_custom"] is False and row["is_offered"] is False


async def test_create_own_service_is_offered_and_bookable(
    logged_in_client: AsyncClient, bookable_provider: Provider
):
    row = _by_name(await _create(logged_in_client))["Монтаж полок на заказ"]
    assert row["is_custom"] is True and row["is_offered"] is True
    assert row["duration_minutes"] == 90 and row["price_min"] == 150 and row["category"] == "assembly"

    public = (await logged_in_client.get(f"/api/providers/{bookable_provider.id}/services")).json()
    assert "Монтаж полок на заказ" in {s["name"] for s in public}

    booked = await logged_in_client.post(
        "/api/bookings", json=_payload(service_id=row["service_id"], provider_id=bookable_provider.id, start=time(10, 0))
    )
    assert booked.status_code == 201, booked.text


async def test_own_service_hidden_from_catalog_and_other_masters(
    logged_in_client: AsyncClient, db_session: AsyncSession, other_provider: Provider
):
    row = _by_name(await _create(logged_in_client))["Монтаж полок на заказ"]

    catalog = (await logged_in_client.get("/api/services")).json()
    assert row["service_id"] not in {s["id"] for s in catalog}

    # в списке другого мастера (и значит в его PUT) чужой услуги нет
    from app.main import _my_visible_services

    visible, _ = await _my_visible_services(db_session, other_provider)
    assert uuid.UUID(row["service_id"]) not in {s.id for s in visible}


async def test_create_rejects_blank_name(logged_in_client: AsyncClient):
    resp = await logged_in_client.post(
        "/api/providers/me/services/custom", json={"name": "   ", "duration_minutes": 30}
    )
    assert resp.status_code == 422


# ----------------------------------------------------------------------------
# редактирование
# ----------------------------------------------------------------------------


async def test_rename_own_service_in_place(logged_in_client: AsyncClient):
    row = _by_name(await _create(logged_in_client))["Монтаж полок на заказ"]
    resp = await logged_in_client.patch(
        f"/api/providers/me/services/{row['service_id']}", json={"name": "Полки", "category": "repair"}
    )
    assert resp.status_code == 200, resp.text
    renamed = _by_name(resp.json())["Полки"]
    assert renamed["service_id"] == row["service_id"] and renamed["category"] == "repair"


async def test_rename_standard_service_forks_a_copy_for_this_master_only(
    logged_in_client: AsyncClient,
    db_session: AsyncSession,
    provider: Provider,
    provider_service: None,
    service: Service,
    other_provider: Provider,
):
    original_name = service.name
    # свой прайс до переименования — должен переехать в копию
    await logged_in_client.put(
        "/api/providers/me/services",
        json={"services": [{"service_id": str(service.id), "price_min": 99, "description": "моё"}]},
    )
    resp = await logged_in_client.patch(f"/api/providers/me/services/{service.id}", json={"name": "Моя сборка"})
    assert resp.status_code == 200, resp.text

    rows = _by_name(resp.json())
    assert original_name not in rows  # стандартная ушла из его списка
    copy = rows["Моя сборка"]
    assert copy["is_custom"] is True and copy["is_offered"] is True
    assert copy["price_min"] == 99 and copy["description"] == "моё"
    assert copy["service_id"] != str(service.id)

    # каталог и другие мастера не затронуты
    await db_session.refresh(service)
    assert service.name == original_name and service.is_active is True
    from app.main import _my_visible_services

    visible, _ = await _my_visible_services(db_session, other_provider)
    assert service.id in {s.id for s in visible}

    removed = (await logged_in_client.get("/api/providers/me/services/removed")).json()
    assert [r["service_id"] for r in removed] == [str(service.id)]


async def test_cannot_edit_service_outside_own_list(
    logged_in_client: AsyncClient, db_session: AsyncSession, tenant: Tenant, other_provider: Provider
):
    foreign = Service(
        id=uuid.uuid4(), tenant_id=tenant.id, name="Чужая", duration_minutes=30, owner_provider_id=other_provider.id
    )
    db_session.add(foreign)
    await db_session.commit()

    assert (await logged_in_client.patch(f"/api/providers/me/services/{foreign.id}", json={"name": "x"})).status_code == 404
    assert (await logged_in_client.delete(f"/api/providers/me/services/{foreign.id}")).status_code == 404


# ----------------------------------------------------------------------------
# удаление и восстановление
# ----------------------------------------------------------------------------


async def test_delete_standard_service_removes_from_own_list_and_restore_brings_it_back(
    logged_in_client: AsyncClient, provider_service: None, service: Service, bookable_provider: Provider
):
    resp = await logged_in_client.delete(f"/api/providers/me/services/{service.id}")
    assert resp.status_code == 200, resp.text
    assert service.name not in _by_name(resp.json())

    # не бронируется и не видна клиенту
    public = (await logged_in_client.get(f"/api/providers/{bookable_provider.id}/services")).json()
    assert str(service.id) not in {s["id"] for s in public}
    booked = await logged_in_client.post(
        "/api/bookings", json=_payload(service_id=service.id, provider_id=bookable_provider.id, start=time(10, 0))
    )
    assert booked.status_code != 201

    # PUT не может включить удалённую обратно
    put = await logged_in_client.put(
        "/api/providers/me/services", json={"services": [{"service_id": str(service.id)}]}
    )
    assert service.name not in _by_name(put.json())

    restored = await logged_in_client.post(f"/api/providers/me/services/{service.id}/restore")
    assert restored.status_code == 200, restored.text
    row = _by_name(restored.json())[service.name]
    assert row["is_offered"] is False  # вернулась в список, включает он сам
    assert (await logged_in_client.get("/api/providers/me/services/removed")).json() == []


async def test_delete_standard_service_that_was_never_linked(logged_in_client: AsyncClient, service: Service):
    resp = await logged_in_client.delete(f"/api/providers/me/services/{service.id}")
    assert resp.status_code == 200, resp.text
    assert service.name not in _by_name(resp.json())


async def test_delete_own_service_retires_it_but_keeps_past_bookings(
    logged_in_client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider
):
    row = _by_name(await _create(logged_in_client))["Монтаж полок на заказ"]
    booked = await logged_in_client.post(
        "/api/bookings", json=_payload(service_id=row["service_id"], provider_id=bookable_provider.id, start=time(10, 0))
    )
    assert booked.status_code == 201, booked.text

    resp = await logged_in_client.delete(f"/api/providers/me/services/{row['service_id']}")
    assert resp.status_code == 200, resp.text
    assert "Монтаж полок на заказ" not in _by_name(resp.json())

    service = await db_session.get(Service, uuid.UUID(row["service_id"]))
    await db_session.refresh(service)
    assert service.is_active is False
    booking = await db_session.get(Booking, uuid.UUID(booked.json()["id"]))
    assert booking is not None and booking.service_id == service.id

    # своя услуга в «удалённых стандартных» не появляется
    assert (await logged_in_client.get("/api/providers/me/services/removed")).json() == []


async def test_restore_unknown_is_404(logged_in_client: AsyncClient, service: Service):
    assert (await logged_in_client.post(f"/api/providers/me/services/{service.id}/restore")).status_code == 404


async def test_seeded_catalog_lookup_ignores_masters_own_service_with_same_name(
    logged_in_client: AsyncClient, db_session: AsyncSession, service: Service, tenant: Tenant
):
    # мастер назвал свою услугу так же, как стандартная — сид по имени не должен споткнуться
    await _create(logged_in_client, name=service.name)
    found = (
        await db_session.execute(
            select(Service).where(
                Service.tenant_id == tenant.id, Service.name == service.name, Service.owner_provider_id.is_(None)
            )
        )
    ).scalar_one()
    assert found.id == service.id
