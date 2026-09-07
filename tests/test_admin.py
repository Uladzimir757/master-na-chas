"""app/main.py's /admin/* endpoints — gated by app.main.require_admin, which
now accepts either the original X-Admin-Secret header (curl/scripts) or an
admin session cookie set by POST /admin/login (the admin panel,
web/app/admin/page.tsx)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Booking, MasterUser, Provider, Service, Tenant
from app.slot_engine import BUSINESS_TZ

TEST_SECRET = "test-admin-secret"


@pytest.fixture(autouse=True)
def _known_admin_secret(monkeypatch: pytest.MonkeyPatch):
    # Never rely on whatever ADMIN_SECRET happens to be in the real .env —
    # tests must be deterministic regardless of the developer's local secrets.
    monkeypatch.setattr(settings, "ADMIN_SECRET", TEST_SECRET)


# ----------------------------------------------------------------------------
# X-Admin-Secret header — the original shape, still supported unchanged.
# ----------------------------------------------------------------------------


async def test_admin_endpoint_rejects_missing_secret(client: AsyncClient):
    resp = await client.post("/admin/masters", json={"name": "Мастер", "email": "m@example.com", "password": "password123"})
    assert resp.status_code == 403


async def test_admin_endpoint_rejects_wrong_secret(client: AsyncClient):
    resp = await client.post(
        "/admin/masters",
        json={"name": "Мастер", "email": "m@example.com", "password": "password123"},
        headers={"x-admin-secret": "not-the-secret"},
    )
    assert resp.status_code == 403


async def test_admin_endpoint_accepts_correct_secret(client: AsyncClient, tenant: Tenant):
    resp = await client.post(
        "/admin/masters",
        json={"name": "Мастер", "email": "m@example.com", "password": "password123"},
        headers={"x-admin-secret": TEST_SECRET},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "provider_id" in body
    assert "master_user_id" in body


async def test_create_master_rejects_duplicate_email(client: AsyncClient, tenant: Tenant):
    headers = {"x-admin-secret": TEST_SECRET}
    payload = {"name": "Мастер", "email": "dup@example.com", "password": "password123"}
    first = await client.post("/admin/masters", json=payload, headers=headers)
    assert first.status_code == 200, first.text

    second = await client.post(
        "/admin/masters", json={**payload, "name": "Другой мастер"}, headers=headers
    )
    assert second.status_code == 409


async def test_create_master_rejects_short_password(client: AsyncClient, tenant: Tenant):
    resp = await client.post(
        "/admin/masters",
        json={"name": "Мастер", "email": "m@example.com", "password": "short"},
        headers={"x-admin-secret": TEST_SECRET},
    )
    assert resp.status_code == 422


async def test_create_master_without_tenant_seeded(client: AsyncClient):
    resp = await client.post(
        "/admin/masters",
        json={"name": "Мастер", "email": "m@example.com", "password": "password123"},
        headers={"x-admin-secret": TEST_SECRET},
    )
    assert resp.status_code == 400


# ----------------------------------------------------------------------------
# POST /admin/login / GET /admin/me / POST /admin/logout — the session route
# the panel actually uses, so the browser never has to hold ADMIN_SECRET
# beyond the login call itself.
# ----------------------------------------------------------------------------


async def test_admin_login_then_me_then_logout(client: AsyncClient):
    me_before = await client.get("/admin/me")
    assert me_before.status_code == 403

    login = await client.post("/admin/login", json={"password": TEST_SECRET})
    assert login.status_code == 200, login.text
    assert login.json() == {"ok": True}

    me = await client.get("/admin/me")
    assert me.status_code == 200
    assert me.json() == {"is_admin": True}

    logout = await client.post("/admin/logout")
    assert logout.status_code == 200

    me_after_logout = await client.get("/admin/me")
    assert me_after_logout.status_code == 403


async def test_admin_login_with_wrong_password_is_rejected(client: AsyncClient):
    resp = await client.post("/admin/login", json={"password": "not-the-secret"})
    assert resp.status_code == 401


async def test_admin_login_rate_limited_after_five_attempts(client: AsyncClient):
    for _ in range(5):
        resp = await client.post("/admin/login", json={"password": "wrong"})
        assert resp.status_code == 401
    blocked = await client.post("/admin/login", json={"password": "wrong"})
    assert blocked.status_code == 429


async def test_admin_session_can_call_header_gated_endpoints(client: AsyncClient, tenant: Tenant):
    # No X-Admin-Secret header at all here — the session cookie from
    # /admin/login alone must be enough for every other /admin/* route.
    login = await client.post("/admin/login", json={"password": TEST_SECRET})
    assert login.status_code == 200

    resp = await client.post(
        "/admin/masters", json={"name": "Мастер", "email": "session@example.com", "password": "password123"}
    )
    assert resp.status_code == 200, resp.text


# ----------------------------------------------------------------------------
# GET /admin/masters — the panel's list view.
# ----------------------------------------------------------------------------


async def test_list_masters_reflects_created_masters(client: AsyncClient, tenant: Tenant):
    headers = {"x-admin-secret": TEST_SECRET}
    await client.post(
        "/admin/masters",
        json={"name": "Владимир", "email": "v@example.com", "password": "password123", "travel_buffer_minutes": 20},
        headers=headers,
    )
    await client.post(
        "/admin/masters", json={"name": "Друг", "email": "friend@example.com", "password": "password123"}, headers=headers
    )

    resp = await client.get("/admin/masters", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2
    by_name = {row["name"]: row for row in body}
    assert by_name["Владимир"]["email"] == "v@example.com"
    assert by_name["Владимир"]["travel_buffer_minutes"] == 20
    assert by_name["Владимир"]["telegram_linked"] is False
    assert by_name["Друг"]["email"] == "friend@example.com"


async def test_list_masters_shows_telegram_linked(client: AsyncClient, master_user: MasterUser, db_session):
    master_user.telegram_chat_id = "12345"
    db_session.add(master_user)
    await db_session.commit()

    resp = await client.get("/admin/masters", headers={"x-admin-secret": TEST_SECRET})
    assert resp.status_code == 200, resp.text
    row = next(r for r in resp.json() if r["master_user_id"] == str(master_user.id))
    assert row["telegram_linked"] is True


async def test_list_masters_requires_admin(client: AsyncClient):
    resp = await client.get("/admin/masters")
    assert resp.status_code == 403


async def test_admin_can_set_master_rating(client: AsyncClient, master_user: MasterUser, db_session):
    headers = {"x-admin-secret": TEST_SECRET}
    resp = await client.patch(
        f"/admin/masters/{master_user.id}", json={"rating": 4.8, "rating_count": 12}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["rating"] == 4.8
    assert resp.json()["rating_count"] == 12

    listing = await client.get("/admin/masters", headers=headers)
    row = next(r for r in listing.json() if r["master_user_id"] == str(master_user.id))
    assert row["rating"] == 4.8


async def test_admin_set_master_rating_rejects_out_of_range_values(client: AsyncClient, master_user: MasterUser):
    resp = await client.patch(
        f"/admin/masters/{master_user.id}",
        json={"rating": 5.5, "rating_count": 1},
        headers={"x-admin-secret": TEST_SECRET},
    )
    assert resp.status_code == 422


async def test_admin_can_clear_master_rating_back_to_null(client: AsyncClient, master_user: MasterUser, db_session):
    headers = {"x-admin-secret": TEST_SECRET}
    await client.patch(f"/admin/masters/{master_user.id}", json={"rating": 4.5, "rating_count": 3}, headers=headers)

    resp = await client.patch(f"/admin/masters/{master_user.id}", json={"rating": None, "rating_count": 0}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["rating"] is None


async def test_admin_set_master_rating_requires_admin(client: AsyncClient, master_user: MasterUser):
    resp = await client.patch(f"/admin/masters/{master_user.id}", json={"rating": 4.0, "rating_count": 1})
    assert resp.status_code == 403


async def test_admin_set_master_rating_404s_for_unknown_master(client: AsyncClient):
    import uuid

    resp = await client.patch(
        f"/admin/masters/{uuid.uuid4()}", json={"rating": 4.0, "rating_count": 1}, headers={"x-admin-secret": TEST_SECRET}
    )
    assert resp.status_code == 404


# ----------------------------------------------------------------------------
# DELETE /admin/masters/{id} — cleanup for a test/duplicate master. Blocked
# (409) rather than cascading if he has bookings — see delete_master's
# docstring in app/main.py.
# ----------------------------------------------------------------------------


async def test_admin_can_delete_master(client: AsyncClient, master_user: MasterUser, db_session: AsyncSession):
    headers = {"x-admin-secret": TEST_SECRET}
    resp = await client.delete(f"/admin/masters/{master_user.id}", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}

    listing = await client.get("/admin/masters", headers=headers)
    assert all(row["master_user_id"] != str(master_user.id) for row in listing.json())

    # provider row itself is gone too, not just the master_user login — a
    # fresh SELECT, not db_session.get() (that would return the row it
    # already cached in its identity map from the `provider` fixture setup,
    # without re-checking the DB where a *different* session did the delete)
    remaining = await db_session.execute(select(Provider).where(Provider.id == master_user.provider_id))
    assert remaining.scalar_one_or_none() is None


async def test_delete_master_requires_admin(client: AsyncClient, master_user: MasterUser):
    resp = await client.delete(f"/admin/masters/{master_user.id}")
    assert resp.status_code == 403


async def test_delete_master_404s_for_unknown_master(client: AsyncClient):
    resp = await client.delete(f"/admin/masters/{uuid.uuid4()}", headers={"x-admin-secret": TEST_SECRET})
    assert resp.status_code == 404


async def test_delete_master_blocked_when_bookings_exist(
    client: AsyncClient, master_user: MasterUser, provider: Provider, service: Service, db_session: AsyncSession
):
    start_at = datetime.combine(datetime.now(BUSINESS_TZ).date() + timedelta(days=7), datetime.min.time(), tzinfo=BUSINESS_TZ).replace(
        hour=10
    )
    booking = Booking(
        id=uuid.uuid4(),
        tenant_id=provider.tenant_id,
        provider_id=provider.id,
        service_id=service.id,
        client_name="Клиент",
        start_at=start_at,
        end_at=start_at + timedelta(hours=1),
    )
    db_session.add(booking)
    await db_session.commit()

    resp = await client.delete(f"/admin/masters/{master_user.id}", headers={"x-admin-secret": TEST_SECRET})
    assert resp.status_code == 409

    # nothing was actually removed
    listing = await client.get("/admin/masters", headers={"x-admin-secret": TEST_SECRET})
    assert any(row["master_user_id"] == str(master_user.id) for row in listing.json())
