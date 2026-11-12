"""Сторож фоновой геолокации (app/geo_watchdog.py): тихий пуш geo_wake
мастеру, у которого включён показ местоположения, а точки не приходят."""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app import geo_watchdog
from app.models import DevicePushToken, MasterUser, Provider
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY

NOW = datetime.combine(NEXT_MONDAY, time(10, 0), tzinfo=BUSINESS_TZ)
NIGHT = datetime.combine(NEXT_MONDAY, time(3, 0), tzinfo=BUSINESS_TZ)


@pytest.fixture(autouse=True)
def sent(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict]]:
    geo_watchdog._reset_for_tests()
    calls: list[tuple[str, dict]] = []

    async def fake_send(*, token: str, data: dict, ttl_seconds: int = 600) -> bool:
        calls.append((token, data))
        return True

    monkeypatch.setattr(geo_watchdog, "send_fcm_data", fake_send)
    return calls


async def _setup(db: AsyncSession, provider: Provider, master_user: MasterUser, *, last_fix: datetime | None,
                 share: bool = True, platform: str = "android") -> None:
    provider.share_location = share
    provider.location_lat = 54.5
    provider.location_lng = 18.5
    provider.location_updated_at = last_fix
    db.add(DevicePushToken(id=uuid.uuid4(), master_user_id=master_user.id, platform=platform,
                           fcm_token=f"tok-{platform}", updated_at=NOW))
    await db.commit()


async def test_wakes_a_silent_master_in_working_hours(db_session, provider, master_user, working_hours_all_week_9_18, sent):
    await _setup(db_session, provider, master_user, last_fix=NOW - timedelta(minutes=20))
    assert await geo_watchdog.run_geo_watchdog(db_session, NOW) == 1
    assert sent == [("tok-android", {"type": "geo_wake"})]


async def test_does_not_repeat_within_half_an_hour(db_session, provider, master_user, working_hours_all_week_9_18, sent):
    await _setup(db_session, provider, master_user, last_fix=NOW - timedelta(minutes=20))
    await geo_watchdog.run_geo_watchdog(db_session, NOW)
    await geo_watchdog.run_geo_watchdog(db_session, NOW + timedelta(minutes=10))
    assert len(sent) == 1
    await geo_watchdog.run_geo_watchdog(db_session, NOW + timedelta(minutes=31))
    assert len(sent) == 2


@pytest.mark.parametrize(
    "last_fix, share, at",
    [
        (NOW - timedelta(minutes=2), True, NOW),  # точки идут
        (NOW - timedelta(minutes=20), False, NOW),  # мастер не делится
        (None, True, NOW),  # ни одной точки не было
        (NIGHT - timedelta(hours=5), True, NIGHT),  # ночь — не будим
    ],
)
async def test_leaves_alone(db_session, provider, master_user, working_hours_all_week_9_18, sent, last_fix, share, at):
    await _setup(db_session, provider, master_user, last_fix=last_fix, share=share)
    assert await geo_watchdog.run_geo_watchdog(db_session, at) == 0
    assert sent == []


async def test_ios_tokens_are_skipped(db_session, provider, master_user, working_hours_all_week_9_18, sent):
    await _setup(db_session, provider, master_user, last_fix=NOW - timedelta(minutes=20), platform="ios")
    assert await geo_watchdog.run_geo_watchdog(db_session, NOW) == 0
    assert sent == []
