"""Роли и права сотрудников мастера.

Четыре роли — это только НАБОРЫ ПРАВ ПО УМОЛЧАНИЮ; у каждого сотрудника
набор можно донастроить чекбоксами (master_user.permissions — jsonb-список
ключей; NULL = права роли). Хозяин/управляющий (owner) всегда имеет всё и
не редактируется — иначе можно случайно запереть кабинет.
"""

ROLE_WORKER_LIMITED = "worker_limited"
ROLE_WORKER = "worker"
ROLE_MANAGER = "manager"
ROLE_OWNER = "owner"

ROLES = (ROLE_WORKER_LIMITED, ROLE_WORKER, ROLE_MANAGER, ROLE_OWNER)

PERMISSIONS = (
    "calendar_view",     # видеть календарь и брони
    "bookings_status",  # подтверждать / завершать / отменять брони, статус «занят»
    "bookings_create",  # создавать брони вручную и переносить их
    "blocks_manage",    # блокировать время в календаре
    "services_edit",    # услуги, цены мастера
    "hours_edit",       # рабочие часы и исключения
    "settings_edit",    # настройки профиля, адрес
    "analytics_view",   # аналитика по работам
    "staff_manage",     # сотрудники и их права
)

_LIMITED = ["calendar_view", "bookings_status"]
_WORKER = _LIMITED + ["bookings_create", "blocks_manage"]
_MANAGER = _WORKER + ["services_edit", "hours_edit", "settings_edit", "analytics_view"]

ROLE_DEFAULTS: dict[str, list[str]] = {
    ROLE_WORKER_LIMITED: _LIMITED,
    ROLE_WORKER: _WORKER,
    ROLE_MANAGER: _MANAGER,
    ROLE_OWNER: list(PERMISSIONS),
}


def effective_permissions(role: str, stored: list[str] | None) -> list[str]:
    if role == ROLE_OWNER:
        return list(PERMISSIONS)
    base = ROLE_DEFAULTS.get(role, _LIMITED) if stored is None else stored
    return [p for p in PERMISSIONS if p in base]
