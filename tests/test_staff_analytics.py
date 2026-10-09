"""Роли/права сотрудников и аналитика по работам."""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, MasterUser, Provider, Service
from app.security import hash_password
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY

PW = "staffpass123"


async def _login_as(client: AsyncClient, db: AsyncSession, provider: Provider, role: str, perms=None):
    u = MasterUser(
        id=uuid.uuid4(),
        provider_id=provider.id,
        email=f"{role}-{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password(PW),
        role=role,
        permissions=perms,
    )
    db.add(u)
    await db.commit()
    await client.post("/auth/logout")
    r = await client.post("/auth/login", json={"email": u.email, "password": PW})
    assert r.status_code == 200
    return u


async def test_me_returns_role_and_permissions(logged_in_client: AsyncClient):
    body = (await logged_in_client.get("/auth/me")).json()
    assert body["role"] == "owner"
    assert "staff_manage" in body["permissions"]


async def test_limited_worker_cannot_edit_services_or_see_staff(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider
):
    await _login_as(logged_in_client, db_session, provider, "worker_limited")
    assert (await logged_in_client.get("/auth/me")).json()["permissions"] == ["calendar_view", "bookings_status"]
    assert (await logged_in_client.get("/api/providers/me/staff")).status_code == 403
    assert (await logged_in_client.put("/api/providers/me/services", json={"services": []})).status_code == 403
    today = NEXT_MONDAY.isoformat()
    assert (
        await logged_in_client.get(f"/api/providers/me/calendar?date_from={today}&date_to={today}")
    ).status_code == 200


async def test_custom_checkbox_permissions_override_role(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider
):
    await _login_as(logged_in_client, db_session, provider, "worker_limited", perms=["analytics_view"])
    d = NEXT_MONDAY.isoformat()
    assert (await logged_in_client.get(f"/api/providers/me/analytics?date_from={d}&date_to={d}")).status_code == 200
    assert (await logged_in_client.get(f"/api/providers/me/calendar?date_from={d}&date_to={d}")).status_code == 403


async def test_owner_manages_staff_and_last_owner_is_protected(
    logged_in_client: AsyncClient, master_user: MasterUser
):
    r = await logged_in_client.post(
        "/api/providers/me/staff",
        json={"name": "Ola", "email": "ola@example.com", "password": PW, "role": "manager"},
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert "analytics_view" in r.json()["permissions"]
    r = await logged_in_client.patch(
        f"/api/providers/me/staff/{sid}", json={"permissions": ["calendar_view", "hours_edit", "bogus"]}
    )
    assert r.status_code == 422
    r = await logged_in_client.patch(f"/api/providers/me/staff/{sid}", json={"permissions": ["calendar_view", "hours_edit"]})
    assert r.json()["permissions"] == ["calendar_view", "hours_edit"]
    r = await logged_in_client.patch(f"/api/providers/me/staff/{sid}", json={"reset_permissions": True})
    assert "analytics_view" in r.json()["permissions"]
    # единственного хозяина нельзя ни удалить, ни понизить
    me = str(master_user.id)
    assert (await logged_in_client.delete(f"/api/providers/me/staff/{me}")).status_code == 409
    assert (await logged_in_client.patch(f"/api/providers/me/staff/{me}", json={"role": "worker"})).status_code == 409
    assert (await logged_in_client.delete(f"/api/providers/me/staff/{sid}")).status_code == 200


async def test_staff_of_other_provider_is_404(logged_in_client: AsyncClient, db_session: AsyncSession, tenant):
    other = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Другой", travel_buffer_minutes=0)
    db_session.add(other)
    await db_session.flush()
    u = MasterUser(id=uuid.uuid4(), provider_id=other.id, email="x@example.com", password_hash="x")
    db_session.add(u)
    await db_session.commit()
    assert (await logged_in_client.delete(f"/api/providers/me/staff/{u.id}")).status_code == 404


async def test_analytics_per_service(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    start = datetime.combine(NEXT_MONDAY, time(9, 0), tzinfo=BUSINESS_TZ)
    for i, (st, price) in enumerate(
        [(BookingStatus.completed, 100), (BookingStatus.completed, 200), (BookingStatus.completed, None),
         (BookingStatus.cancelled, None), (BookingStatus.confirmed, None)]
    ):
        s = start + timedelta(hours=i)
        db_session.add(
            Booking(id=uuid.uuid4(), tenant_id=provider.tenant_id, provider_id=provider.id, service_id=service.id,
                    client_name="K", start_at=s, end_at=s + timedelta(minutes=30), status=st, price=price)
        )
    await db_session.commit()
    d = NEXT_MONDAY.isoformat()
    body = (await logged_in_client.get(f"/api/providers/me/analytics?date_from={d}&date_to={d}")).json()
    (row,) = body["services"]
    assert row["completed"] == 3 and row["cancelled"] == 1
    assert row["total_minutes"] == 90 and row["avg_minutes"] == 30.0
    assert float(row["revenue"]) == 300.0 and row["priced_jobs"] == 2 and float(row["avg_price"]) == 150.0


async def test_complete_with_price_is_saved(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    s = datetime.combine(NEXT_MONDAY, time(9, 0), tzinfo=BUSINESS_TZ)
    b = Booking(id=uuid.uuid4(), tenant_id=provider.tenant_id, provider_id=provider.id, service_id=service.id,
                client_name="K", start_at=s, end_at=s + timedelta(hours=1), status=BookingStatus.confirmed)
    db_session.add(b)
    await db_session.commit()
    r = await logged_in_client.patch(f"/api/bookings/{b.id}/status", json={"status": "completed", "price": "250"})
    assert r.status_code == 200 and float(r.json()["price"]) == 250.0
