"""GET/PUT /api/providers/me/working-hours and PUT/DELETE
/api/providers/me/working-hours/exceptions/{date} — a master's own weekly
schedule (app/main.py's get_my_working_hours / update_my_working_hours /
upsert_working_hours_exception / delete_working_hours_exception).

Both underlying tables (WorkingHours, WorkingHoursException) already existed
for app/slot_engine.py to read (see test_slot_engine.py for availability-
generation coverage) — this file is HTTP-level coverage for the new
cabinet-facing CRUD, added alongside it rather than leaving the endpoints
themselves untested (same convention as test_provider_settings.py /
test_provider_busy.py)."""

from __future__ import annotations

import uuid
from datetime import time, timedelta

from httpx import AsyncClient

from app.models import Provider, WorkingHours, WorkingHoursException
from tests.conftest import NEXT_MONDAY


async def test_get_working_hours_requires_login(client: AsyncClient):
    resp = await client.get("/api/providers/me/working-hours")
    assert resp.status_code == 401


async def test_get_working_hours_defaults_to_empty(logged_in_client: AsyncClient):
    resp = await logged_in_client.get("/api/providers/me/working-hours")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["slots"] == []
    assert body["exceptions"] == []


async def test_put_working_hours_requires_login(client: AsyncClient):
    resp = await client.put("/api/providers/me/working-hours", json={"slots": []})
    assert resp.status_code == 401


async def test_put_working_hours_sets_the_weekly_template(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        "/api/providers/me/working-hours",
        json={
            "slots": [
                {"weekday": 0, "start_time": "09:00:00", "end_time": "13:00:00"},
                {"weekday": 0, "start_time": "15:00:00", "end_time": "19:00:00"},
                {"weekday": 2, "start_time": "10:00:00", "end_time": "18:00:00"},
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    slots = resp.json()["slots"]
    assert len(slots) == 3
    monday_slots = [s for s in slots if s["weekday"] == 0]
    assert len(monday_slots) == 2
    assert {s["start_time"] for s in monday_slots} == {"09:00:00", "15:00:00"}

    # not just the response echoing the request back — actually persisted
    again = await logged_in_client.get("/api/providers/me/working-hours")
    assert again.status_code == 200, again.text
    assert len(again.json()["slots"]) == 3


async def test_put_working_hours_is_replace_semantics(logged_in_client: AsyncClient):
    first = await logged_in_client.put(
        "/api/providers/me/working-hours",
        json={"slots": [{"weekday": 0, "start_time": "09:00:00", "end_time": "17:00:00"}]},
    )
    assert first.status_code == 200, first.text

    second = await logged_in_client.put(
        "/api/providers/me/working-hours",
        json={"slots": [{"weekday": 3, "start_time": "08:00:00", "end_time": "12:00:00"}]},
    )
    assert second.status_code == 200, second.text
    slots = second.json()["slots"]
    # Monday from the first PUT is gone, only Thursday remains
    assert len(slots) == 1
    assert slots[0]["weekday"] == 3


async def test_put_working_hours_empty_slots_clears_the_template(
    logged_in_client: AsyncClient, provider: Provider, db_session
):
    db_session.add(
        WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=0, start_time=time(9, 0), end_time=time(17, 0))
    )
    await db_session.commit()

    resp = await logged_in_client.put("/api/providers/me/working-hours", json={"slots": []})
    assert resp.status_code == 200, resp.text
    assert resp.json()["slots"] == []


async def test_put_working_hours_rejects_end_before_start(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        "/api/providers/me/working-hours",
        json={"slots": [{"weekday": 0, "start_time": "17:00:00", "end_time": "09:00:00"}]},
    )
    assert resp.status_code == 422


async def test_put_working_hours_rejects_overlapping_windows_same_weekday(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        "/api/providers/me/working-hours",
        json={
            "slots": [
                {"weekday": 0, "start_time": "09:00:00", "end_time": "14:00:00"},
                {"weekday": 0, "start_time": "13:00:00", "end_time": "18:00:00"},
            ]
        },
    )
    assert resp.status_code == 422


async def test_put_working_hours_allows_adjacent_non_overlapping_windows(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        "/api/providers/me/working-hours",
        json={
            "slots": [
                {"weekday": 0, "start_time": "09:00:00", "end_time": "13:00:00"},
                {"weekday": 0, "start_time": "13:00:00", "end_time": "18:00:00"},
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["slots"]) == 2


async def test_put_working_hours_is_scoped_to_the_caller_own_provider(
    logged_in_client: AsyncClient, provider: Provider, db_session
):
    other_provider = Provider(id=uuid.uuid4(), tenant_id=provider.tenant_id, name="Другой", travel_buffer_minutes=0)
    db_session.add(other_provider)
    db_session.add(
        WorkingHours(
            id=uuid.uuid4(), provider_id=other_provider.id, weekday=1, start_time=time(9, 0), end_time=time(17, 0)
        )
    )
    await db_session.commit()

    resp = await logged_in_client.put(
        "/api/providers/me/working-hours",
        json={"slots": [{"weekday": 0, "start_time": "09:00:00", "end_time": "17:00:00"}]},
    )
    assert resp.status_code == 200, resp.text

    other_rows = (
        await db_session.execute(
            WorkingHours.__table__.select().where(WorkingHours.provider_id == other_provider.id)
        )
    ).all()
    assert len(other_rows) == 1  # untouched by our PUT


# ----------------------------------------------------------------------------
# Per-date exceptions
# ----------------------------------------------------------------------------


async def test_upsert_exception_requires_login(client: AsyncClient):
    resp = await client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": False},
    )
    assert resp.status_code == 401


async def test_upsert_exception_day_off(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": False, "reason": "отпуск"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_available"] is False
    assert body["start_time"] is None
    assert body["end_time"] is None
    assert body["reason"] == "отпуск"


async def test_upsert_exception_custom_hours(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": True, "start_time": "10:00:00", "end_time": "14:00:00"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_available"] is True
    assert body["start_time"] == "10:00:00"
    assert body["end_time"] == "14:00:00"


async def test_upsert_exception_available_requires_hours(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": True},
    )
    assert resp.status_code == 422


async def test_upsert_exception_rejects_end_before_start(logged_in_client: AsyncClient):
    resp = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": True, "start_time": "14:00:00", "end_time": "10:00:00"},
    )
    assert resp.status_code == 422


async def test_upsert_exception_overwrites_not_duplicates(logged_in_client: AsyncClient, provider: Provider, db_session):
    first = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": False},
    )
    assert first.status_code == 200, first.text

    second = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": True, "start_time": "08:00:00", "end_time": "12:00:00"},
    )
    assert second.status_code == 200, second.text
    assert second.json()["is_available"] is True

    rows = (
        await db_session.execute(
            WorkingHoursException.__table__.select().where(WorkingHoursException.provider_id == provider.id)
        )
    ).all()
    assert len(rows) == 1  # replaced, not a second row for the same date


async def test_get_working_hours_includes_upcoming_exception(logged_in_client: AsyncClient):
    put_resp = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": False},
    )
    assert put_resp.status_code == 200, put_resp.text

    resp = await logged_in_client.get("/api/providers/me/working-hours")
    assert resp.status_code == 200, resp.text
    exceptions = resp.json()["exceptions"]
    assert len(exceptions) == 1
    assert exceptions[0]["date"] == NEXT_MONDAY.isoformat()


async def test_get_working_hours_excludes_past_exceptions(
    logged_in_client: AsyncClient, provider: Provider, db_session
):
    past_date = NEXT_MONDAY - timedelta(days=30)
    db_session.add(
        WorkingHoursException(id=uuid.uuid4(), provider_id=provider.id, date=past_date, is_available=False)
    )
    await db_session.commit()

    resp = await logged_in_client.get("/api/providers/me/working-hours")
    assert resp.status_code == 200, resp.text
    assert resp.json()["exceptions"] == []


async def test_delete_exception_requires_login(client: AsyncClient):
    resp = await client.delete(f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}")
    assert resp.status_code == 401


async def test_delete_exception_removes_it(logged_in_client: AsyncClient):
    put_resp = await logged_in_client.put(
        f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}",
        json={"is_available": False},
    )
    assert put_resp.status_code == 200, put_resp.text

    del_resp = await logged_in_client.delete(f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}")
    assert del_resp.status_code == 200, del_resp.text

    again = await logged_in_client.get("/api/providers/me/working-hours")
    assert again.json()["exceptions"] == []


async def test_delete_exception_404_when_none_exists(logged_in_client: AsyncClient):
    resp = await logged_in_client.delete(f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}")
    assert resp.status_code == 404


async def test_exception_endpoints_are_scoped_to_the_caller_own_provider(
    logged_in_client: AsyncClient, provider: Provider, db_session
):
    other_provider = Provider(id=uuid.uuid4(), tenant_id=provider.tenant_id, name="Другой", travel_buffer_minutes=0)
    db_session.add(other_provider)
    db_session.add(
        WorkingHoursException(
            id=uuid.uuid4(), provider_id=other_provider.id, date=NEXT_MONDAY, is_available=False
        )
    )
    await db_session.commit()

    # Nothing of ours exists for that date yet, even though the OTHER
    # provider has one — must 404, not accidentally touch their row.
    resp = await logged_in_client.delete(f"/api/providers/me/working-hours/exceptions/{NEXT_MONDAY.isoformat()}")
    assert resp.status_code == 404

    other_rows = (
        await db_session.execute(
            WorkingHoursException.__table__.select().where(WorkingHoursException.provider_id == other_provider.id)
        )
    ).all()
    assert len(other_rows) == 1  # untouched
