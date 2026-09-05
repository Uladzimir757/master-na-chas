"""CORSMiddleware (app/main.py) — an Origin outside
settings.CORS_ALLOWED_ORIGINS must not get Access-Control-Allow-Origin back.
CORS is enforced by the *browser*, not the server: the request itself still
succeeds either way, but without that header a browser refuses to expose the
response to the page's own JS."""

from __future__ import annotations

from httpx import AsyncClient

from app.config import settings

ALLOWED_ORIGIN = settings.cors_allowed_origins_list[0]  # "http://localhost:3000" by default


async def test_allowed_origin_gets_the_header(client: AsyncClient):
    resp = await client.get("/health", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_disallowed_origin_gets_no_header(client: AsyncClient):
    resp = await client.get("/health", headers={"Origin": "https://evil.example"})
    assert resp.status_code == 200
    assert "access-control-allow-origin" not in resp.headers
