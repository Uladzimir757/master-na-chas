"""SQLAlchemy models — mirrors db/schema.sql exactly. Keep the two in sync by hand;
there are few enough tables that a migration tool (alembic) is not worth the
ceremony yet at this scale (same "right complexity for current scale" call as
elsewhere in this project)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# All timestamptz columns in schema.sql must map through this, not bare
# `Mapped[datetime]` — SQLAlchemy otherwise infers a naive DateTime() and
# asyncpg then refuses any tz-aware Python datetime written to it (caught by
# an actual run, not by inspection — see the telegram_link_token.used_at fix
# this uncovered).
TZDateTime = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


def _uuid_col(*, primary_key: bool = False, fk: str | None = None):
    kwargs = {}
    if fk:
        return mapped_column(PgUUID(as_uuid=True), ForeignKey(fk), primary_key=primary_key, **kwargs)
    return mapped_column(PgUUID(as_uuid=True), primary_key=primary_key, default=uuid.uuid4)


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class Tenant(Base):
    __tablename__ = "tenant"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    slug: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)


class Provider(Base):
    __tablename__ = "provider"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    name: Mapped[str] = mapped_column(String)
    travel_buffer_minutes: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    # master's own on/off switch (Этап 2): true = new bookings start
    # `pending`, master confirms via PATCH /api/bookings/{id}/status before
    # it's real (current behavior, safe default). false = auto-confirm on
    # creation — no manual step. Per-provider, not global: each master
    # decides for themself, matches "у мастера есть график" — his booking,
    # his call.
    requires_booking_confirmation: Mapped[bool] = mapped_column(default=True)

    working_hours: Mapped[list["WorkingHours"]] = relationship(back_populates="provider")
    master_user: Mapped["MasterUser | None"] = relationship(back_populates="provider", uselist=False)


class Service(Base):
    __tablename__ = "service"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    name: Mapped[str] = mapped_column(String)
    duration_minutes: Mapped[int] = mapped_column(CheckConstraint("duration_minutes > 0"))
    # schema.sql has had these since Этап 1; only wiring them into the ORM
    # now that the booking page actually needs to show a price.
    price_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_max: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(default=True)


class ProviderService(Base):
    __tablename__ = "provider_service"

    provider_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True, fk="provider.id")
    service_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True, fk="service.id")


class WorkingHours(Base):
    __tablename__ = "working_hours"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    weekday: Mapped[int]  # 0=Monday .. 6=Sunday, matches date.weekday()
    start_time: Mapped[time]
    end_time: Mapped[time]

    provider: Mapped["Provider"] = relationship(back_populates="working_hours")


class WorkingHoursException(Base):
    __tablename__ = "working_hours_exception"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    date: Mapped[date]
    is_available: Mapped[bool]
    start_time: Mapped[time | None]
    end_time: Mapped[time | None]


class Client(Base):
    __tablename__ = "client"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    name: Mapped[str] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)


class Booking(Base):
    __tablename__ = "booking"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    service_id: Mapped[uuid.UUID] = _uuid_col(fk="service.id")
    client_name: Mapped[str] = mapped_column(String)
    client_phone: Mapped[str | None] = mapped_column(String)
    start_at: Mapped[datetime] = mapped_column(TZDateTime)
    end_at: Mapped[datetime] = mapped_column(TZDateTime)
    status: Mapped[BookingStatus] = mapped_column(
        PgEnum(BookingStatus, name="booking_status", create_type=False),
        default=BookingStatus.pending,
    )
    notes: Mapped[str | None] = mapped_column(Text)


class MasterUser(Base):
    """Login for a provider. Deliberately minimal — see docs/mvp-task.md #4:
    this is the right size for 2 users, not the final architecture."""

    __tablename__ = "master_user"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    email: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    # nullable, filled only by the /telegram/webhook deep-link handshake —
    # never set by hand, never in config. See TelegramLinkToken below.
    telegram_chat_id: Mapped[str | None] = mapped_column(String)

    provider: Mapped["Provider"] = relationship(back_populates="master_user")

    __table_args__ = (UniqueConstraint("provider_id"),)


class TelegramLinkToken(Base):
    """One-shot token for the no-hardcode Telegram linking flow (mvp-task.md #5):
    superadmin creates a row, hands the master `t.me/<bot>?start=<token>`; the
    webhook consumes it and writes chat_id onto MasterUser itself."""

    __tablename__ = "telegram_link_token"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    master_user_id: Mapped[uuid.UUID] = _uuid_col(fk="master_user.id")
    used_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class WebPushSubscription(Base):
    __tablename__ = "web_push_subscription"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    master_user_id: Mapped[uuid.UUID] = _uuid_col(fk="master_user.id")
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String)
    auth: Mapped[str] = mapped_column(String)
