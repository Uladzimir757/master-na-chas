"""Voice input for clients: recorded audio -> text (decision 20.11.2026, the
same way as in the zlecai project).

The browser (or the Android app's WebView) records with MediaRecorder and
POSTs the raw audio to /api/transcribe; this module turns it into text with
OpenAI (`TRANSCRIBE_MODEL`, default gpt-4o-mini-transcribe, ~0.003 $/min).
Neither the audio nor the recognised text is stored or logged anywhere — the
text goes straight back into the client's field, and the client sends the
form himself. Anthropic has no speech recognition, hence OpenAI here.

Protection like any paid call: per-IP limits on the endpoint (slowapi) plus
a process-wide daily budget of calls (`DAILY_TRANSCRIBE_CALLS`).
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from app.config import settings

logger = logging.getLogger("speech")

MAX_AUDIO_BYTES = 2 * 1024 * 1024
# Content-Type (without parameters like ;codecs=opus) -> file extension the
# OpenAI API recognises the format by
AUDIO_TYPES = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}


class TranscriptionUnavailable(Exception):
    """No key, the day's budget is spent, or OpenAI failed — the client sees
    «try again / type instead», never a crash."""


_budget_lock = threading.Lock()
_budget_day: str | None = None
_budget_used = 0


def _take_budget() -> None:
    """One call out of today's DAILY_TRANSCRIBE_CALLS (UTC day, in process
    memory — the API runs as one instance)."""
    global _budget_day, _budget_used
    today = datetime.now(timezone.utc).date().isoformat()
    with _budget_lock:
        if _budget_day != today:
            _budget_day, _budget_used = today, 0
        if _budget_used >= settings.DAILY_TRANSCRIBE_CALLS:
            raise TranscriptionUnavailable("daily budget spent")
        _budget_used += 1


def reset_budget() -> None:
    """For tests."""
    global _budget_day, _budget_used
    with _budget_lock:
        _budget_day, _budget_used = None, 0


def audio_extension(content_type: str | None) -> str | None:
    base = (content_type or "").split(";")[0].strip().lower()
    return AUDIO_TYPES.get(base)


def transcribe(audio: bytes, extension: str) -> str:
    """Blocking — call it in a thread pool. Returns "" when nothing was
    heard. The language isn't hinted: the model works it out."""
    if not settings.OPENAI_API_KEY:
        raise TranscriptionUnavailable("no OPENAI_API_KEY")
    _take_budget()
    try:
        import openai

        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY, timeout=30.0)
        result = client.audio.transcriptions.create(
            model=settings.TRANSCRIBE_MODEL,
            file=(f"voice.{extension}", audio),
        )
    except Exception as exc:
        # the error class only — never the audio or any text
        logger.warning("transcribe_failed: %s", type(exc).__name__)
        raise TranscriptionUnavailable("openai failed") from exc
    return (getattr(result, "text", "") or "").strip()
