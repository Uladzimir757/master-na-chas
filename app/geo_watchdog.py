"""Сторож фоновой геолокации мастера (решение пользователя 12.11.2026).

На Xiaomi/HyperOS смахивание приложения из недавних убивает процесс вместе
с сервисом геолокации, и сам он не поднимется до следующего открытия
приложения. Сервер это видит: у мастера включено «показывать
местоположение», сейчас его рабочие часы, а точки не приходят дольше
GEO_STALE. Тогда на его Android-телефоны уходит тихий пуш
{"type": "geo_wake"}: приложение (ZrMessagingService) пробует снова
запустить сервис, а если не может — показывает уведомление «Lokalizacja
wyłączona — dotknij, aby włączyć». Телефоны, где мастер геолокацией не
делился (менеджер, второй телефон), пуш молча игнорируют.

Не чаще раза в GEO_WAKE_REPEAT на мастера. Отметка о последней отправке —
в памяти процесса: после перезапуска сервера пуш может уйти раньше, это
безвредно, а отдельная колонка в базе ради этого не нужна.

Если Xiaomi не доставляет пуш убитому приложению (без «Автозапуска») —
ничего не поделать; для этого в кабинете кнопки настроек (GeoKeepAlive).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DevicePushToken, MasterUser, Provider
from app.notifications import send_fcm_data
from app.slot_engine import is_within_working_hours

logger = logging.getLogger(__name__)

# Телефон шлёт точку ~раз в 30 с; 5 минут тишины — сервис точно не работает.
GEO_STALE = timedelta(minutes=5)
GEO_WAKE_REPEAT = timedelta(minutes=30)

_last_wake: dict[uuid.UUID, datetime] = {}


def _reset_for_tests() -> None:
    _last_wake.clear()


async def due_providers(db: AsyncSession, now: datetime) -> list[Provider]:
    """Мастера, которым пора послать geo_wake."""
    rows = (
        await db.execute(
            select(Provider).where(Provider.share_location.is_(True), Provider.is_active.is_(True))
        )
    ).scalars().all()
    due = []
    for p in rows:
        # ни одной точки ещё не было — сервис и не запускался, будить нечего
        if p.location_updated_at is None or now - p.location_updated_at < GEO_STALE:
            continue
        last = _last_wake.get(p.id)
        if last is not None and now - last < GEO_WAKE_REPEAT:
            continue
        if not await is_within_working_hours(db, p.id, now):
            continue
        due.append(p)
    return due


async def run_geo_watchdog(db: AsyncSession, now: datetime) -> int:
    """Возвращает число мастеров, которым ушёл geo_wake."""
    sent = 0
    for provider in await due_providers(db, now):
        tokens = (
            await db.execute(
                select(DevicePushToken.fcm_token)
                .join(MasterUser, MasterUser.id == DevicePushToken.master_user_id)
                .where(MasterUser.provider_id == provider.id, DevicePushToken.platform == "android")
            )
        ).scalars().all()
        _last_wake[provider.id] = now
        if not tokens:
            continue
        for token in tokens:
            await send_fcm_data(token=token, data={"type": "geo_wake"})
        logger.info("geo_wake sent provider=%s tokens=%d", provider.id, len(tokens))
        sent += 1
    return sent
