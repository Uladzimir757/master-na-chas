"""In-memory translation cache (Этап 3, docs/ai-and-reviews.md §1).

Holds only status='approved' rows, keyed by (namespace, key, lang). Loaded
once at app startup and refreshed ONLY by POST /admin/translations/approve
in app/main.py — deliberately NOT touched by the plain PUT
/admin/translations upsert. That split mirrors Garage System's own
documented lesson: their /update endpoint saves a translation to the
database but forgets to call refresh(), so an edit looks live to whoever
made it but silently isn't, for every real visitor, until someone
remembers to hit /approve separately. Keeping "save a draft" and "make it
live" as two different calls — one of which touches this cache and one of
which doesn't — makes that class of bug structurally impossible here rather
than a matter of remembering.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TranslationEntry

# The user's real audience (docs/ai-and-reviews.md §1) — English can be added
# later if/when it's actually needed, not speculatively now.
SUPPORTED_LANGS: tuple[str, ...] = ("pl", "ru", "uk")
DEFAULT_LANG = "pl"


class TranslationCache:
    """Deliberately dumb: a dict and two methods. `load()` replaces the whole
    dict in one assignment (not mutated key-by-key), so a request reading
    `_data` mid-refresh always sees either the fully-old or fully-new
    snapshot, never a half-updated mix."""

    def __init__(self) -> None:
        self._data: dict[tuple[str, str, str], str] = {}

    def get_all(self, namespace: str, lang: str) -> dict[str, str]:
        return {key: text for (ns, key, entry_lang), text in self._data.items() if ns == namespace and entry_lang == lang}

    def load(self, rows: list[tuple[str, str, str, str]]) -> None:
        """rows: (namespace, key, lang, text) tuples — approved only."""
        self._data = {(ns, key, lang): text for ns, key, lang, text in rows}


# One process-wide instance — same "small enough scale that a module-level
# singleton is the right amount of ceremony" call as elsewhere in this
# project (see app/models.py's migration-tool note).
translation_cache = TranslationCache()


async def refresh_translation_cache(db: AsyncSession) -> None:
    """Re-reads every approved row and atomically replaces the cache. Called
    at app startup (app/main.py) and after every approve — never after a
    plain upsert, see this module's docstring."""
    rows = (
        await db.execute(
            select(
                TranslationEntry.namespace,
                TranslationEntry.key,
                TranslationEntry.lang,
                TranslationEntry.text,
            ).where(TranslationEntry.status == "approved")
        )
    ).all()
    translation_cache.load([tuple(r) for r in rows])
