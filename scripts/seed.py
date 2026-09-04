"""One-time seed: one tenant, one starter service, two provider rows (you +
friend) with a placeholder working-hours template. Run once against a fresh
DB: python -m scripts.seed

This does NOT create master_user login accounts — those (and the real
telegram_chat_id linkage) are created separately via POST /admin/masters +
POST /admin/masters/{id}/telegram-link, not by this script. If a provider
row created here doesn't yet have a matching master_user, that master can't
log in until an admin creates one for it.

Not a public registration form on purpose — see docs/decisions.md
("Мультитенантность — не строим... регистрация мастеров — только через
суперадмина")."""

import asyncio
import uuid
from datetime import time

from sqlalchemy import select

from app.db import async_session_factory
from app.models import Provider, ProviderService, Service, Tenant, WorkingHours
from app.security import hash_password

# Mon(0)-Fri(4), 09:00-18:00 — a starting point, not a real schedule. Adjust
# per-provider via the DB (or a future /admin endpoint) once you know your
# actual hours; this just needs the two seeded providers to be bookable.
DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4]
DEFAULT_START = time(9, 0)
DEFAULT_END = time(18, 0)


async def main() -> None:
    async with async_session_factory() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "master-na-chas"))).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(id=uuid.uuid4(), slug="master-na-chas", name="Мастер на час — Gdynia")
            db.add(tenant)
            await db.flush()
            print(f"created tenant {tenant.id}")
        else:
            print(f"tenant already exists: {tenant.id}")

        service = (
            await db.execute(select(Service).where(Service.tenant_id == tenant.id, Service.name == "Сборка мебели"))
        ).scalar_one_or_none()
        if service is None:
            service = Service(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Сборка мебели",
                duration_minutes=90,
            )
            db.add(service)
            await db.flush()
            print(f"created starter service {service.id} — add more via /admin later")

        for name, email in [("Владимир", "master1@example.com"), ("Друг", "master2@example.com")]:
            provider = (await db.execute(select(Provider).where(Provider.name == name))).scalar_one_or_none()
            if provider is None:
                provider = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name=name, travel_buffer_minutes=30)
                db.add(provider)
                await db.flush()
                print(f"created provider {name}: {provider.id}  (create a master_user for login via POST /admin/masters)")
            else:
                print(f"provider {name} already exists: {provider.id}")

            link = (
                await db.execute(
                    select(ProviderService).where(
                        ProviderService.provider_id == provider.id, ProviderService.service_id == service.id
                    )
                )
            ).scalar_one_or_none()
            if link is None:
                db.add(ProviderService(provider_id=provider.id, service_id=service.id))
                print(f"  linked {name} -> {service.name}")

            existing_hours = (
                await db.execute(select(WorkingHours).where(WorkingHours.provider_id == provider.id))
            ).scalars().all()
            if not existing_hours:
                for weekday in DEFAULT_WORKING_DAYS:
                    db.add(
                        WorkingHours(
                            id=uuid.uuid4(),
                            provider_id=provider.id,
                            weekday=weekday,
                            start_time=DEFAULT_START,
                            end_time=DEFAULT_END,
                        )
                    )
                print(f"  seeded default working hours (Mon-Fri 09:00-18:00) for {name}")

        await db.commit()
        print("seed done. NOTE: password hashing example — hash_password('changeme') =", hash_password("changeme")[:20], "...")


if __name__ == "__main__":
    asyncio.run(main())
