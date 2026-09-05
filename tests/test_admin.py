"""app/main.py's /admin/* endpoints — gated by the X-Admin-Secret header
(app.main.require_admin), not by login/session."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import settings

TEST_SECRET = "test-admin-secret"


@pytest.fixture(autouse=True)
def _known_admin_secret(monkeypatch: pytest.MonkeyPatch):
    # Never rely on whatever ADMIN_SECRET happens to be in the real .env —
    # tests must be deterministic regardless of the developer's local secrets.
    monkeypatch.setattr(settings, "ADMIN_SECRET", TEST_SECRET)


async def test_admin_endpoint_rejects_missing_secret(client: AsyncClient):
    resp = await client.post("/admin/masters", params={"name": "Мастер", "email": "m@example.com", "password": "x"})
    assert resp.status_code == 403


async def test_admin_endpoint_rejects_wrong_secret(client: AsyncClient):
    resp = await client.post(
        "/admin/masters",
        params={"name": "Мастер", "email": "m@example.com", "password": "x"},
        headers={"x-admin-secret": "not-the-secret"},
    )
    assert resp.status_code == 403


async def test_admin_endpoint_accepts_correct_secret(client: AsyncClient, tenant):
    resp = await client.post(
        "/admin/masters",
        params={"name": "Мастер", "email": "m@example.com", "password": "x"},
        headers={"x-admin-secret": TEST_SECRET},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "provider_id" in body
    assert "master_user_id" in body
