"""In-memory кэш публичного каталога (docs/load-readiness.md, п.2).

Города, список мастеров города и услуги мастера читает каждый посетитель
главной, а меняются они редко — из кабинета мастера или админки. Кэш на
PUBLIC_CACHE_SECONDS снимает эти чтения с базы; браузер кэширует их столько
же (Cache-Control). Слоты и всё, что зависит от свободного времени, сюда НЕ
попадает — иначе «слот занят» и двойные брони.

Кэш на процесс: при нескольких воркерах uvicorn каждый держит свой, и сброс
после записи (middleware в app/main.py) чистит только тот воркер, который её
принял. Остальные досчитают устаревшее не дольше TTL — для цены, рейтинга,
городов это приемлемо.
"""

from __future__ import annotations

import time
from typing import Any

from app.config import settings

_MISSING = object()


class TTLCache:
    def __init__(self, ttl_seconds: float) -> None:
        self.ttl = ttl_seconds
        self._data: dict[Any, tuple[float, Any]] = {}

    def get(self, key: Any) -> Any:
        hit = self._data.get(key)
        if hit is None or hit[0] < time.monotonic():
            return _MISSING
        return hit[1]

    def set(self, key: Any, value: Any) -> Any:
        if self.ttl > 0:
            self._data[key] = (time.monotonic() + self.ttl, value)
        return value

    def clear(self) -> None:
        self._data.clear()


public_cache = TTLCache(settings.PUBLIC_CACHE_SECONDS)


def is_missing(value: Any) -> bool:
    return value is _MISSING


def cache_control() -> str:
    return f"public, max-age={int(public_cache.ttl)}" if public_cache.ttl > 0 else "no-store"


# Записи, после которых публичный каталог мог измениться. Частые записи, не
# влияющие на него (геолокация мастера раз в 30 с, «занят», тик, брони
# клиентов, пуш-токены), кэш не сбрасывают — иначе он бы не жил.
_INVALIDATING_PREFIXES = ("/api/providers/me", "/admin", "/api/reviews")
_NON_INVALIDATING_PREFIXES = ("/api/providers/me/location", "/api/providers/me/busy")


def write_invalidates(method: str, path: str) -> bool:
    if method in ("GET", "HEAD", "OPTIONS"):
        return False
    if path.startswith(_NON_INVALIDATING_PREFIXES):
        return False
    return path.startswith(_INVALIDATING_PREFIXES)
