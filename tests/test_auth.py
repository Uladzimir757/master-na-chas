"""POST /auth/login, GET /auth/me, POST /auth/logout — the cookie-session
flow (app/security.py's require_master_user_id).

master_user and MASTER_PASSWORD now live in conftest.py (tests/test_master_bookings.py
needs a real, authenticatable master too) — this file just exercises the
login/logout/me endpoints directly instead of going through logged_in_client,
since that fixture would hide the very steps being tested here."""

from __future__ import annotations

from httpx import AsyncClient

from app.models import MasterUser
from tests.conftest import MASTER_PASSWORD


async def test_login_then_me_then_logout(client: AsyncClient, master_user: MasterUser):
    login = await client.post("/auth/login", json={"email": master_user.email, "password": MASTER_PASSWORD})
    assert login.status_code == 200, login.text
    assert login.json() == {"ok": True}

    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["master_user_id"] == str(master_user.id)

    logout = await client.post("/auth/logout")
    assert logout.status_code == 200

    me_after_logout = await client.get("/auth/me")
    assert me_after_logout.status_code == 401


async def test_login_with_wrong_password_is_rejected(client: AsyncClient, master_user: MasterUser):
    resp = await client.post("/auth/login", json={"email": master_user.email, "password": "wrong-password"})
    assert resp.status_code == 401


async def test_me_requires_login(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


# ----------------------------------------------------------------------------
# POST /auth/change-password — previously only the superadmin could ever set
# a master's password (at creation, see tests/test_admin.py); now the master
# can change their own from the cabinet.
# ----------------------------------------------------------------------------


async def test_change_password_requires_login(client: AsyncClient):
    resp = await client.post(
        "/auth/change-password", json={"current_password": MASTER_PASSWORD, "new_password": "a-new-password"}
    )
    assert resp.status_code == 401


async def test_change_password_with_correct_current_password_succeeds(
    logged_in_client: AsyncClient, master_user: MasterUser
):
    resp = await logged_in_client.post(
        "/auth/change-password", json={"current_password": MASTER_PASSWORD, "new_password": "a-new-password"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}


async def test_new_password_actually_works_for_the_next_login(logged_in_client: AsyncClient, master_user: MasterUser):
    await logged_in_client.post(
        "/auth/change-password", json={"current_password": MASTER_PASSWORD, "new_password": "a-new-password"}
    )
    await logged_in_client.post("/auth/logout")

    # The old password should now be rejected and the new one should work,
    # proving the hash was actually updated in the DB, not just accepted
    # and silently discarded.
    old_password_login = await logged_in_client.post(
        "/auth/login", json={"email": master_user.email, "password": MASTER_PASSWORD}
    )
    assert old_password_login.status_code == 401

    new_password_login = await logged_in_client.post(
        "/auth/login", json={"email": master_user.email, "password": "a-new-password"}
    )
    assert new_password_login.status_code == 200, new_password_login.text


async def test_change_password_with_wrong_current_password_is_rejected(
    logged_in_client: AsyncClient, master_user: MasterUser
):
    resp = await logged_in_client.post(
        "/auth/change-password", json={"current_password": "totally-wrong", "new_password": "a-new-password"}
    )
    assert resp.status_code == 401

    # And the real password must still work — a rejected attempt should
    # never have touched the stored hash.
    login = await logged_in_client.post("/auth/login", json={"email": master_user.email, "password": MASTER_PASSWORD})
    assert login.status_code == 200


async def test_change_password_rejects_a_too_short_new_password(logged_in_client: AsyncClient):
    resp = await logged_in_client.post(
        "/auth/change-password", json={"current_password": MASTER_PASSWORD, "new_password": "short"}
    )
    assert resp.status_code == 422
