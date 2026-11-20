"""POST /api/transcribe — голосовой ввод клиента (app/speech.py, 20.11.2026).
OpenAI здесь подменён: реальных вызовов тесты не делают."""

from __future__ import annotations

import openai
import pytest
from httpx import AsyncClient

import app.speech as speech
from app.config import settings

AUDIO = b"\x1aE\xdf\xa3" + b"\x00" * 4000  # looks like webm, content irrelevant


@pytest.fixture
def fake_openai(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict] = []
    answer: dict = {"text": "Cieknie kran w kuchni", "fail": False}

    class FakeTranscriptions:
        def create(self, model, file):
            calls.append({"model": model, "filename": file[0], "size": len(file[1])})
            if answer["fail"]:
                raise RuntimeError("openai down")
            return type("R", (), {"text": answer["text"]})()

    class FakeClient:
        def __init__(self, *a, **k):
            self.audio = type("A", (), {"transcriptions": FakeTranscriptions()})()

    monkeypatch.setattr(openai, "OpenAI", FakeClient)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    speech.reset_budget()
    return calls, answer


async def _post(client: AsyncClient, body: bytes = AUDIO, ctype: str = "audio/webm;codecs=opus"):
    return await client.post("/api/transcribe", content=body, headers={"Content-Type": ctype})


async def test_audio_becomes_text(client: AsyncClient, fake_openai):
    calls, _ = fake_openai
    r = await _post(client)
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "Cieknie kran w kuchni"}
    # the file name tells OpenAI the format; codecs=… is ignored
    assert calls[0]["filename"] == "voice.webm" and calls[0]["model"] == settings.TRANSCRIBE_MODEL


async def test_safari_mp4_is_accepted(client: AsyncClient, fake_openai):
    calls, _ = fake_openai
    assert (await _post(client, ctype="audio/mp4")).status_code == 200
    assert calls[0]["filename"] == "voice.mp4"


async def test_silence_is_an_empty_text_not_an_error(client: AsyncClient, fake_openai):
    _, answer = fake_openai
    answer["text"] = "   "
    r = await _post(client)
    assert r.status_code == 200 and r.json() == {"text": ""}


async def test_not_audio_is_415(client: AsyncClient, fake_openai):
    assert (await _post(client, ctype="text/plain")).status_code == 415
    assert (await _post(client, ctype="application/json")).status_code == 415


async def test_too_big_is_413_and_empty_is_422(client: AsyncClient, fake_openai):
    calls, _ = fake_openai
    assert (await _post(client, body=b"\x00" * (speech.MAX_AUDIO_BYTES + 1))).status_code == 413
    assert (await _post(client, body=b"")).status_code == 422
    assert calls == []


async def test_no_key_or_openai_failure_is_503(client: AsyncClient, fake_openai, monkeypatch: pytest.MonkeyPatch):
    _, answer = fake_openai
    answer["fail"] = True
    assert (await _post(client)).status_code == 503
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    assert (await _post(client)).status_code == 503


async def test_daily_budget_stops_paid_calls(client: AsyncClient, fake_openai, monkeypatch: pytest.MonkeyPatch):
    calls, _ = fake_openai
    monkeypatch.setattr(settings, "DAILY_TRANSCRIBE_CALLS", 2)
    assert (await _post(client)).status_code == 200
    assert (await _post(client)).status_code == 200
    assert (await _post(client)).status_code == 503
    assert len(calls) == 2


async def test_per_ip_rate_limit(client: AsyncClient, fake_openai, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "RATE_VOICE_PER_MIN", 2)
    assert (await _post(client)).status_code == 200
    assert (await _post(client)).status_code == 200
    assert (await _post(client)).status_code == 429
