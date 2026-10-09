"""Вход по Bearer-токену (запасной путь для Safari/iOS, где межсайтовые cookie
блокируются): токен выдаётся при логине и принимается вместо cookie."""

from __future__ import annotations

from httpx import AsyncClient

from app.config import settings
from app.models import MasterUser
from tests.conftest import MASTER_PASSWORD


async def test_master_token_works_without_cookie(client: AsyncClient, master_user: MasterUser):
    r = await client.post("/auth/login", json={"email": master_user.email, "password": MASTER_PASSWORD})
    token = r.json()["token"]
    assert token
    client.cookies.clear()
    assert (await client.get("/auth/me")).status_code == 401
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["master_user_id"] == str(master_user.id)


async def test_tampered_or_foreign_token_rejected(client: AsyncClient, master_user: MasterUser):
    r = await client.post("/auth/login", json={"email": master_user.email, "password": MASTER_PASSWORD})
    token = r.json()["token"]
    client.cookies.clear()
    bad = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}x"})
    assert bad.status_code == 401
    # мастерский токен не открывает админку
    adm = await client.get("/admin/masters", headers={"Authorization": f"Bearer {token}"})
    assert adm.status_code == 403


async def test_admin_token_works_without_cookie(client: AsyncClient):
    r = await client.post("/admin/login", json={"password": settings.ADMIN_SECRET})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    client.cookies.clear()
    assert (await client.get("/admin/masters")).status_code == 403
    ok = await client.get("/admin/masters", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200
    # админский токен не открывает кабинет мастера
    assert (await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})).status_code == 401


async def test_non_ascii_admin_secret_is_403_not_500(client: AsyncClient):
    r = await client.get("/admin/masters", headers={"X-Admin-Secret": "пароль".encode("utf-8")})
    assert r.status_code == 403
    r = await client.post("/admin/login", json={"password": "пароль"})
    assert r.status_code == 401
