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
