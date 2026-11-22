"""Карта клиента у мастера: история заказов, личные заметки и личный чёрный
список (решения пользователя 22.11.2026).

Правила:
  - всё личное у каждого мастера: заметки и отметки одного мастера не видны
    другим мастерам и платформе (ключ — provider_id + телефон клиента);
  - чёрный список только ПРЕДУПРЕЖДАЕТ: заказ от такого номера приходит с
    красной пометкой и причиной, но не блокируется и не отклоняется;
  - история собирается из заказов мастера по номеру телефона (E.164); заказы
    без номера (например, внесённые вручную) в карты не попадают.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, ClientNote, Service

BLOCK_REASONS = ("no_payment", "no_access", "rude", "other")
# для текста уведомления мастеру (пишет LLM по этим фактам)
BLOCK_REASON_TEXT = {
    "no_payment": "did not pay",
    "no_access": "was not home / did not open the door",
    "rude": "was rude or aggressive",
    "other": "other reason",
}


class ClientFlag(BaseModel):
    """Что мастер знает о клиенте — подмешивается в его заказы."""

    blocked: bool = False
    reason: str | None = None
    comment: str | None = None
    note: str | None = None


class ClientRowOut(BaseModel):
    phone: str
    name: str
    orders: int
    completed: int
    cancelled: int
    no_show: int
    revenue: Decimal
    last_at: datetime
    blocked: bool
    has_note: bool


class ClientHistoryItem(BaseModel):
    id: uuid.UUID
    start_at: datetime
    service_name: str
    status: BookingStatus
    price: Decimal | None


class ClientCardOut(BaseModel):
    phone: str
    name: str
    orders: int
    completed: int
    cancelled: int
    no_show: int
    revenue: Decimal
    last_at: datetime | None
    note: str | None
    blocked: bool
    block_reason: str | None
    block_comment: str | None
    blocked_at: datetime | None
    history: list[ClientHistoryItem]


class ClientNoteIn(BaseModel):
    phone: str
    note: str | None = Field(default=None, max_length=1000)


class ClientBlockIn(BaseModel):
    phone: str
    blocked: bool
    reason: str | None = None
    comment: str | None = Field(default=None, max_length=300)


def _stats(bookings: list[Booking]) -> dict:
    s = {"orders": len(bookings), "completed": 0, "cancelled": 0, "no_show": 0, "revenue": Decimal(0)}
    for b in bookings:
        if b.status == BookingStatus.completed:
            s["completed"] += 1
            if b.price is not None:
                s["revenue"] += b.price
        elif b.status == BookingStatus.cancelled:
            s["cancelled"] += 1
        elif b.status == BookingStatus.no_show:
            s["no_show"] += 1
    return s


async def _bookings_by_phone(db: AsyncSession, provider_id: uuid.UUID) -> dict[str, list[Booking]]:
    rows = (
        await db.execute(
            select(Booking)
            .where(
                Booking.provider_id == provider_id,
                Booking.client_phone.is_not(None),
                # клиент не разрешил показать номер мастеру — в карты не попадает
                Booking.client_phone_visible.is_(True),
            )
            .order_by(Booking.start_at.desc())
        )
    ).scalars().all()
    out: dict[str, list[Booking]] = {}
    for b in rows:
        out.setdefault(b.client_phone, []).append(b)  # type: ignore[arg-type]
    return out


async def list_clients(db: AsyncSession, provider_id: uuid.UUID, q: str | None = None) -> list[ClientRowOut]:
    by_phone = await _bookings_by_phone(db, provider_id)
    notes = {
        n.client_phone: n
        for n in (await db.execute(select(ClientNote).where(ClientNote.provider_id == provider_id))).scalars().all()
    }
    needle = (q or "").strip().lower()
    digits = "".join(ch for ch in needle if ch.isdigit())
    out: list[ClientRowOut] = []
    for phone, bookings in by_phone.items():
        latest = bookings[0]  # новые первыми — имя берём из последнего заказа
        if needle and needle not in latest.client_name.lower() and not (digits and digits in phone):
            continue
        n = notes.get(phone)
        out.append(
            ClientRowOut(
                phone=phone,
                name=latest.client_name,
                last_at=latest.start_at,
                blocked=bool(n and n.blocked),
                has_note=bool(n and n.note),
                **_stats(bookings),
            )
        )
    # заблокированные первыми (чтобы не потерялись), затем по последнему заказу
    out.sort(key=lambda r: (not r.blocked, -r.last_at.timestamp()))
    return out


async def get_card(db: AsyncSession, provider_id: uuid.UUID, phone: str) -> ClientCardOut:
    bookings = (await _bookings_by_phone(db, provider_id)).get(phone, [])
    note = await db.get(ClientNote, (provider_id, phone))
    services = {}
    if bookings:
        ids = {b.service_id for b in bookings}
        services = {
            s.id: s.name_pl or s.name
            for s in (await db.execute(select(Service).where(Service.id.in_(ids)))).scalars().all()
        }
    return ClientCardOut(
        phone=phone,
        name=bookings[0].client_name if bookings else "",
        last_at=bookings[0].start_at if bookings else None,
        note=note.note if note else None,
        blocked=bool(note and note.blocked),
        block_reason=note.block_reason if note and note.blocked else None,
        block_comment=note.block_comment if note and note.blocked else None,
        blocked_at=note.blocked_at if note and note.blocked else None,
        history=[
            ClientHistoryItem(
                id=b.id, start_at=b.start_at, service_name=services.get(b.service_id, ""),
                status=b.status, price=b.price,
            )
            for b in bookings[:50]
        ],
        **_stats(bookings),
    )


async def _row(db: AsyncSession, provider_id: uuid.UUID, phone: str) -> ClientNote:
    row = await db.get(ClientNote, (provider_id, phone))
    if row is None:
        row = ClientNote(provider_id=provider_id, client_phone=phone)
        db.add(row)
    return row


async def save_note(db: AsyncSession, provider_id: uuid.UUID, phone: str, note: str | None) -> None:
    row = await _row(db, provider_id, phone)
    row.note = (note or "").strip() or None
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()


async def set_blocked(
    db: AsyncSession, provider_id: uuid.UUID, phone: str, blocked: bool, reason: str | None, comment: str | None
) -> None:
    row = await _row(db, provider_id, phone)
    row.blocked = blocked
    if blocked:
        row.block_reason = reason if reason in BLOCK_REASONS else "other"
        row.block_comment = (comment or "").strip() or None
        row.blocked_at = datetime.now(timezone.utc)
    else:
        row.block_reason = row.block_comment = row.blocked_at = None
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()


async def flags_for(db: AsyncSession, provider_id: uuid.UUID, phones: set[str]) -> dict[str, ClientFlag]:
    """Отметки мастера о клиентах с этими номерами (только те, где есть что показать)."""
    if not phones:
        return {}
    rows = (
        await db.execute(
            select(ClientNote).where(ClientNote.provider_id == provider_id, ClientNote.client_phone.in_(phones))
        )
    ).scalars().all()
    return {
        n.client_phone: ClientFlag(
            blocked=n.blocked, reason=n.block_reason, comment=n.block_comment, note=n.note
        )
        for n in rows
        if n.blocked or n.note
    }
