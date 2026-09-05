"""Этап 3 (docs/ai-and-reviews.md §1) — translation_entry + TranslationCache.

The one thing this file exists to nail down: PUT /admin/translations (save a
draft) must NEVER make text visible via GET /api/translations on its own —
only POST /admin/translations/approve may. That's the exact
save-but-forget-to-refresh trap the design doc calls out from Garage
System's own history; if this regresses, a masters typing a correction into
the (future) admin UI would silently publish it to every real visitor
without ever calling approve.

translation_cache is process-global state (see app/translations.py), so
every test here resets it to empty first — otherwise leftover approved
entries from one test could leak into the next test's assertions, or into
an unrelated test file's.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Service, Tenant, TranslationEntry
from app.translations import translation_cache

TEST_SECRET = "test-admin-secret"


@pytest.fixture(autouse=True)
def _known_admin_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ADMIN_SECRET", TEST_SECRET)


@pytest.fixture(autouse=True)
def _reset_translation_cache():
    translation_cache.load([])
    yield
    translation_cache.load([])


ADMIN_HEADERS = {"x-admin-secret": TEST_SECRET}


# ----------------------------------------------------------------------------
# The core draft/approve split
# ----------------------------------------------------------------------------


async def test_public_translations_endpoint_is_empty_before_anything_is_approved(client: AsyncClient):
    resp = await client.get("/api/translations", params={"lang": "pl"})
    assert resp.status_code == 200
    assert resp.json() == {}


async def test_upsert_alone_does_not_make_a_translation_visible(client: AsyncClient):
    """The whole point of the cache design: PUT saves to the DB but must not
    touch what GET /api/translations serves."""
    resp = await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "loading", "lang": "pl", "text": "Ładowanie…", "status": "draft"},
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 200, resp.text

    resp = await client.get("/api/translations", params={"lang": "pl"})
    assert resp.json() == {}


async def test_approve_makes_it_visible(client: AsyncClient):
    await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "loading", "lang": "pl", "text": "Ładowanie…", "status": "reviewed"},
        headers=ADMIN_HEADERS,
    )

    resp = await client.post(
        "/admin/translations/approve",
        json={"entries": [{"namespace": "ui", "key": "loading", "lang": "pl"}]},
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 200, resp.text

    resp = await client.get("/api/translations", params={"lang": "pl"})
    assert resp.json() == {"loading": "Ładowanie…"}


async def test_upsert_after_approve_does_not_change_the_live_text_until_approved_again(client: AsyncClient):
    """The trap in its sharpest form: editing an already-approved key's text
    must not silently change what's live — that's still a save, not a
    publish, until approve is called again."""
    await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "loading", "lang": "pl", "text": "v1", "status": "approved"},
        headers=ADMIN_HEADERS,
    )
    await client.post(
        "/admin/translations/approve",
        json={"entries": [{"namespace": "ui", "key": "loading", "lang": "pl"}]},
        headers=ADMIN_HEADERS,
    )
    assert (await client.get("/api/translations", params={"lang": "pl"})).json() == {"loading": "v1"}

    # Edit the text, but don't approve again.
    await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "loading", "lang": "pl", "text": "v2 - not live yet", "status": "approved"},
        headers=ADMIN_HEADERS,
    )
    assert (await client.get("/api/translations", params={"lang": "pl"})).json() == {"loading": "v1"}

    # Now approve it — v2 goes live.
    await client.post(
        "/admin/translations/approve",
        json={"entries": [{"namespace": "ui", "key": "loading", "lang": "pl"}]},
        headers=ADMIN_HEADERS,
    )
    assert (await client.get("/api/translations", params={"lang": "pl"})).json() == {"loading": "v2 - not live yet"}


async def test_approve_of_unknown_entry_is_404_and_does_not_refresh_anything_else(client: AsyncClient):
    await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "loading", "lang": "pl", "text": "x", "status": "approved"},
        headers=ADMIN_HEADERS,
    )
    resp = await client.post(
        "/admin/translations/approve",
        json={"entries": [{"namespace": "ui", "key": "does-not-exist", "lang": "pl"}]},
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 404
    # The one approved-but-not-yet-approve-called entry from above is still
    # correctly absent — a failed approve call must not have side effects.
    assert (await client.get("/api/translations", params={"lang": "pl"})).json() == {}


async def test_namespace_and_lang_scope_what_is_returned(client: AsyncClient):
    for namespace, key, lang, text in [
        ("ui", "loading", "pl", "Ładowanie…"),
        ("ui", "loading", "ru", "Загрузка…"),
        ("ui", "submitting", "pl", "Wysyłanie…"),
    ]:
        await client.put(
            "/admin/translations",
            json={"namespace": namespace, "key": key, "lang": lang, "text": text, "status": "approved"},
            headers=ADMIN_HEADERS,
        )
    await client.post(
        "/admin/translations/approve",
        json={
            "entries": [
                {"namespace": "ui", "key": "loading", "lang": "pl"},
                {"namespace": "ui", "key": "loading", "lang": "ru"},
                {"namespace": "ui", "key": "submitting", "lang": "pl"},
            ]
        },
        headers=ADMIN_HEADERS,
    )

    assert (await client.get("/api/translations", params={"lang": "pl"})).json() == {
        "loading": "Ładowanie…",
        "submitting": "Wysyłanie…",
    }
    assert (await client.get("/api/translations", params={"lang": "ru"})).json() == {"loading": "Загрузка…"}


async def test_unsupported_lang_falls_back_to_default_pl(client: AsyncClient):
    resp = await client.get("/api/translations", params={"lang": "de"})
    assert resp.status_code == 200
    # Doesn't error — just resolves to the default (pl) namespace, which is
    # legitimately empty here since nothing was seeded.
    assert resp.json() == {}


# ----------------------------------------------------------------------------
# Admin auth (mirrors tests/test_admin.py's own coverage of require_admin)
# ----------------------------------------------------------------------------


async def test_admin_translation_endpoints_reject_missing_secret(client: AsyncClient):
    assert (await client.get("/admin/translations")).status_code == 403
    assert (
        await client.put("/admin/translations", json={"namespace": "ui", "key": "x", "lang": "pl", "text": "y"})
    ).status_code == 403
    assert (
        await client.post("/admin/translations/approve", json={"entries": [{"namespace": "ui", "key": "x", "lang": "pl"}]})
    ).status_code == 403


async def test_admin_translation_endpoints_reject_wrong_secret(client: AsyncClient):
    resp = await client.get("/admin/translations", headers={"x-admin-secret": "wrong"})
    assert resp.status_code == 403


async def test_upsert_rejects_unsupported_lang(client: AsyncClient):
    resp = await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "loading", "lang": "de", "text": "x"},
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 422


async def test_list_translations_filters_by_status(client: AsyncClient):
    await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "a", "lang": "pl", "text": "draft text", "status": "draft"},
        headers=ADMIN_HEADERS,
    )
    await client.put(
        "/admin/translations",
        json={"namespace": "ui", "key": "b", "lang": "pl", "text": "approved text", "status": "approved"},
        headers=ADMIN_HEADERS,
    )
    resp = await client.get("/admin/translations", params={"status": "draft"}, headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    keys = {e["key"] for e in resp.json()}
    assert keys == {"a"}


# ----------------------------------------------------------------------------
# Lang-aware service names (Service.name_pl/name_ru/name_uk)
# ----------------------------------------------------------------------------


async def test_services_endpoint_resolves_name_by_requested_lang(client: AsyncClient, db_session: AsyncSession, tenant: Tenant):
    svc = Service(
        tenant_id=tenant.id,
        name="Сборка мебели",
        name_ru="Сборка мебели",
        name_pl="Montaż mebli",
        name_uk="Збирання меблів",
        duration_minutes=90,
    )
    db_session.add(svc)
    await db_session.commit()

    resp = await client.get("/api/services", params={"lang": "pl"})
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "Montaż mebli"

    resp = await client.get("/api/services", params={"lang": "uk"})
    assert resp.json()[0]["name"] == "Збирання меблів"


async def test_services_endpoint_falls_back_to_ru_then_name_when_a_locale_is_missing(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant
):
    # No name_pl/name_uk set at all — a service seeded before this feature
    # existed, or one whose translation just hasn't been filled in yet.
    svc = Service(tenant_id=tenant.id, name="Сборка мебели", name_ru="Сборка мебели", duration_minutes=90)
    db_session.add(svc)
    await db_session.commit()

    resp = await client.get("/api/services", params={"lang": "pl"})
    assert resp.json()[0]["name"] == "Сборка мебели"  # falls back to name_ru

    # And with name_ru itself unset too — falls all the way back to `name`.
    svc2 = Service(tenant_id=tenant.id, name="Сантехника", duration_minutes=60)
    db_session.add(svc2)
    await db_session.commit()
    resp = await client.get("/api/services", params={"lang": "uk"})
    names = {row["name"] for row in resp.json()}
    assert "Сантехника" in names


async def test_services_endpoint_defaults_to_pl_when_lang_omitted(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant
):
    svc = Service(tenant_id=tenant.id, name="Сборка мебели", name_ru="ru-name", name_pl="pl-name", duration_minutes=90)
    db_session.add(svc)
    await db_session.commit()

    resp = await client.get("/api/services")
    assert resp.json()[0]["name"] == "pl-name"


async def test_my_services_checklist_is_lang_aware(
    client: AsyncClient, db_session: AsyncSession, logged_in_client: AsyncClient, provider, tenant: Tenant
):
    svc = Service(tenant_id=tenant.id, name="Сборка мебели", name_ru="ru-name", name_pl="pl-name", duration_minutes=90)
    db_session.add(svc)
    await db_session.commit()

    resp = await logged_in_client.get("/api/providers/me/services", params={"lang": "pl"})
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "pl-name"
