"""POST /auth/login, GET /auth/me, POST /auth/logout — the cookie-session
flow (app/security.py's require_master_user_id)."""

from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MasterUser, Provider
from app.security import hash_password

PASSWORD = "correct-horse-battery-staple"


@pytest_asyncio.fixture
async def master_user(db_session: AsyncSession, provider: Provider) -> MasterUser:
    row = MasterUser(
        id=uuid.uuid4(), provider_id=provider.id, email="master@example.com", password_hash=hash_password(PASSWORD)
    )
    db_session.add(row)
    await db_session.commit()
    return row


async def test_login_then_me_then_logout(client: AsyncClient, master_user: MasterUser):
    login = await client.post("/auth/login", json={"email": master_user.email, "password": PASSWORD})
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
