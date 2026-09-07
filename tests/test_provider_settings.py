"""GET /api/providers/me and PATCH /api/providers/me/settings — a master's
own on/off switches (app/main.py's get_my_provider_settings /
update_my_provider_settings). No dedicated HTTP-level coverage existed for
this endpoint before (test_bookings_api.py only ever set
requires_booking_confirmation directly via the ORM) — added here alongside
the new call_out_fee field rather than leaving the endpoint itself untested.
"""

from __future__ import annotations

from httpx import AsyncClient

from app.models import Provider


async def test_get_my_settings_requires_login(client: AsyncClient):
    resp = await client.get("/api/providers/me")
    assert resp.status_code == 401


async def test_get_my_settings_defaults(logged_in_client: AsyncClient, provider: Provider):
    resp = await logged_in_client.get("/api/providers/me")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(provider.id)
    assert body["requires_booking_confirmation"] is True  # schema default
    assert body["call_out_fee"] is None
    assert body["share_location"] is False  # schema default


async def test_patch_my_settings_requires_login(client: AsyncClient):
    resp = await client.patch(
        "/api/providers/me/settings",
        json={"requires_booking_confirmation": False, "call_out_fee": None, "share_location": False},
    )
    assert resp.status_code == 401


async def test_patch_my_settings_updates_all_fields_and_persists(logged_in_client: AsyncClient):
    resp = await logged_in_client.patch(
        "/api/providers/me/settings",
        json={"requires_booking_confirmation": False, "call_out_fee": 50, "share_location": True},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["requires_booking_confirmation"] is False
    assert body["call_out_fee"] == 50
    assert body["share_location"] is True

    # not just the response echoing the request back — actually persisted
    again = await logged_in_client.get("/api/providers/me")
    assert again.status_code == 200, again.text
    assert again.json()["call_out_fee"] == 50
    assert again.json()["requires_booking_confirmation"] is False
    assert again.json()["share_location"] is True


async def test_patch_my_settings_can_clear_call_out_fee_back_to_null(logged_in_client: AsyncClient):
    set_resp = await logged_in_client.patch(
        "/api/providers/me/settings",
        json={"requires_booking_confirmation": True, "call_out_fee": 75, "share_location": False},
    )
    assert set_resp.status_code == 200, set_resp.text
    assert set_resp.json()["call_out_fee"] == 75

    clear_resp = await logged_in_client.patch(
        "/api/providers/me/settings",
        json={"requires_booking_confirmation": True, "call_out_fee": None, "share_location": False},
    )
    assert clear_resp.status_code == 200, clear_resp.text
    assert clear_resp.json()["call_out_fee"] is None


async def test_patch_my_settings_can_turn_share_location_back_off(logged_in_client: AsyncClient):
    on_resp = await logged_in_client.patch(
        "/api/providers/me/settings",
        json={"requires_booking_confirmation": True, "call_out_fee": None, "share_location": True},
    )
    assert on_resp.status_code == 200, on_resp.text
    assert on_resp.json()["share_location"] is True

    off_resp = await logged_in_client.patch(
        "/api/providers/me/settings",
        json={"requires_booking_confirmation": True, "call_out_fee": None, "share_location": False},
    )
    assert off_resp.status_code == 200, off_resp.text
    assert off_resp.json()["share_location"] is False


async def test_patch_my_settings_is_scoped_to_the_caller_own_provider(
    logged_in_client: AsyncClient, provider: Provider, db_session
):
    import uuid

    other_provider = Provider(id=uuid.uuid4(), tenant_id=provider.tenant_id, name="Другой", travel_buffer_minutes=0)
    db_session.add(other_provider)
    await db_session.commit()

    resp = await logged_in_client.patch(
        "/api/providers/me/settings",
        json={"requires_booking_confirmation": False, "call_out_fee": 999, "share_location": True},
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(other_provider)
    assert other_provider.call_out_fee is None
    assert other_provider.requires_booking_confirmation is True
    assert other_provider.share_location is False


async def test_public_providers_list_includes_call_out_fee(client: AsyncClient, provider: Provider, db_session):
    provider.call_out_fee = 60
    await db_session.commit()

    resp = await client.get("/api/providers")

    assert resp.status_code == 200, resp.text
    row = next(p for p in resp.json() if p["id"] == str(provider.id))
    assert row["call_out_fee"] == 60


async def test_public_providers_list_is_sorted_by_rating_best_first_unrated_last(
    client: AsyncClient, provider: Provider, db_session, tenant
):
    import uuid

    from app.models import Provider as ProviderModel

    rated_low = ProviderModel(id=uuid.uuid4(), tenant_id=tenant.id, name="Низкий рейтинг", rating=3.5)
    rated_high = ProviderModel(id=uuid.uuid4(), tenant_id=tenant.id, name="Высокий рейтинг", rating=4.9)
    db_session.add_all([rated_low, rated_high])
    # `provider` (the conftest fixture) stays unrated (rating=None by default)
    await db_session.commit()

    resp = await client.get("/api/providers")
    assert resp.status_code == 200, resp.text
    ids_in_order = [p["id"] for p in resp.json()]

    assert ids_in_order.index(str(rated_high.id)) < ids_in_order.index(str(rated_low.id))
    assert ids_in_order.index(str(rated_low.id)) < ids_in_order.index(str(provider.id))
