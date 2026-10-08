"""app/llm_text.py + the compose-then-send layer in app/notifications.py.

Тексты уведомлений пишет LLM, а не код. Здесь проверяется всё вокруг модели:
язык по номеру, защита ссылки, отказ при чужих ссылках, «нет ключа — нет
уведомления», и что к LLM не ходим, если канал всё равно выключен. Реального
обращения к API нет — клиент подменён.
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import llm_text, notifications
from app.config import settings

LINK = "https://web.example/review/?booking_id=abc&token=xyz"


def _response(text: str, stop_reason: str = "end_turn"):
    blocks = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)]
    return SimpleNamespace(content=blocks, stop_reason=stop_reason)


@pytest.fixture
def llm(monkeypatch: pytest.MonkeyPatch):
    """Ключ задан, _call_model подменён; calls хранит присланные payload'ы."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    state = SimpleNamespace(calls=[], reply=_response("Dzień dobry"))

    async def fake_call(user_json: str):
        state.calls.append(user_json)
        if isinstance(state.reply, Exception):
            raise state.reply
        return state.reply

    monkeypatch.setattr(llm_text, "_call_model", fake_call)
    return state


async def _compose(**overrides):
    kwargs = dict(recipient="client", purpose="p", language="Polish", max_chars=300)
    kwargs.update(overrides)
    return await llm_text.compose_message(**kwargs)


@pytest.mark.parametrize(
    "phone, expected",
    [
        ("+48501234567", "Polish"),
        ("0048501234567", "Polish"),
        ("501234567", "Polish"),
        (None, "Polish"),
        ("+44 7700 900123", "English"),
        ("+380501234567", "English"),
        ("0044 7700 900123", "English"),
    ],
)
def test_language_for_phone(phone, expected):
    assert llm_text.language_for_phone(phone) == expected


async def test_no_api_key_returns_none_without_calling_the_model(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")

    async def boom(user_json: str):
        raise AssertionError("model must not be called without a key")

    monkeypatch.setattr(llm_text, "_call_model", boom)

    assert await _compose() is None


async def test_returns_only_text_blocks_and_sends_facts_as_json(llm):
    llm.reply = _response("  Dzień dobry, wizyta potwierdzona.  ")

    text = await _compose(facts={"service": "Hydraulik"}, language="Polish")

    assert text == "Dzień dobry, wizyta potwierdzona."
    payload = json.loads(llm.calls[0])
    assert payload["language"] == "Polish"
    assert payload["facts"] == {"service": "Hydraulik"}
    assert payload["max_chars"] == 300


async def test_model_failure_returns_none(llm):
    llm.reply = RuntimeError("api down")

    assert await _compose() is None


async def test_refusal_returns_none(llm):
    llm.reply = _response("", stop_reason="refusal")

    assert await _compose() is None


async def test_empty_answer_returns_none(llm):
    llm.reply = _response("   ")

    assert await _compose() is None


async def test_must_include_link_is_appended_when_the_model_drops_it(llm):
    llm.reply = _response("Oceń pracę mistrza.")

    text = await _compose(must_include=LINK)

    assert text is not None and text.endswith(LINK)


async def test_must_include_link_kept_once_when_present(llm):
    llm.reply = _response(f"Oceń pracę: {LINK}")

    text = await _compose(must_include=LINK)

    assert text == f"Oceń pracę: {LINK}"
    assert text.count(LINK) == 1


async def test_foreign_url_is_rejected(llm):
    llm.reply = _response("Zadzwoń: https://evil.example/pay")

    assert await _compose(must_include=None) is None
    assert await _compose(must_include=LINK) is None


async def test_overlong_answer_is_rejected(llm):
    llm.reply = _response("x" * 700)

    assert await _compose(max_chars=300) is None


class _FakeMessages:
    def __init__(self, sink: list, label: str):
        self._sink, self._label = sink, label

    async def create(self, **kwargs):
        self._sink.append((self._label, kwargs))
        return _response("ok")


def _fake_client(sink: list):
    return SimpleNamespace(
        messages=_FakeMessages(sink, "plain"),
        beta=SimpleNamespace(messages=_FakeMessages(sink, "beta")),
    )


async def test_call_model_uses_beta_fallback_by_default(monkeypatch: pytest.MonkeyPatch):
    sink: list = []
    monkeypatch.setattr(llm_text, "_get_client", lambda: _fake_client(sink))
    monkeypatch.setattr(settings, "NOTIFICATION_LLM_FALLBACK_MODEL", "claude-opus-4-8")

    await llm_text._call_model("{}")

    label, kwargs = sink[0]
    assert label == "beta"
    assert kwargs["model"] == settings.NOTIFICATION_LLM_MODEL
    assert kwargs["fallbacks"] == [{"model": "claude-opus-4-8"}]
    assert kwargs["betas"] == ["server-side-fallback-2026-06-01"]
    assert kwargs["system"] == llm_text.SYSTEM_PROMPT
    assert kwargs["output_config"] == {"effort": "low"}


async def test_call_model_without_fallback_uses_plain_endpoint(monkeypatch: pytest.MonkeyPatch):
    sink: list = []
    monkeypatch.setattr(llm_text, "_get_client", lambda: _fake_client(sink))
    monkeypatch.setattr(settings, "NOTIFICATION_LLM_FALLBACK_MODEL", "")

    await llm_text._call_model("{}")

    label, kwargs = sink[0]
    assert label == "plain"
    assert "fallbacks" not in kwargs and "betas" not in kwargs


# --- слой отправки: notifications.notify_* -------------------------------------


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch):
    out = SimpleNamespace(sms=[], telegram=[], push=[], composed=[])

    async def fake_sms(*, to_phone, text):
        out.sms.append((to_phone, text))

    async def fake_telegram(chat_id, text):
        out.telegram.append((chat_id, text))

    async def fake_push(*, endpoint, p256dh, auth, payload):
        out.push.append((endpoint, payload))

    async def fake_compose(**kwargs):
        out.composed.append(kwargs)
        return "Tytuł\n\nTreść wiadomości"

    monkeypatch.setattr(notifications, "send_sms", fake_sms)
    monkeypatch.setattr(notifications, "send_telegram_message", fake_telegram)
    monkeypatch.setattr(notifications, "send_web_push", fake_push)
    monkeypatch.setattr(notifications, "compose_message", fake_compose)
    return out


async def test_sms_disabled_never_calls_the_llm(sent, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "SMS_ENABLED", False)

    await notifications.notify_client_sms(phone="+48501234567", purpose="p")

    assert sent.composed == [] and sent.sms == []


async def test_sms_enabled_composes_in_phone_language_and_sends(sent, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "SMS_ENABLED", True)

    await notifications.notify_client_sms(phone="+44 7700 900123", purpose="p", must_include=LINK)

    assert sent.composed[0]["language"] == "English"
    assert sent.composed[0]["must_include"] == LINK
    assert sent.sms == [("+44 7700 900123", "Tytuł\n\nTreść wiadomości")]


async def test_sms_not_sent_when_llm_returns_nothing(sent, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "SMS_ENABLED", True)

    async def nothing(**kwargs):
        return None

    monkeypatch.setattr(notifications, "compose_message", nothing)

    await notifications.notify_client_sms(phone="+48501234567", purpose="p")

    assert sent.sms == []


async def test_master_notification_skipped_without_active_channel(sent, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", False)

    await notifications.notify_master(
        telegram_chat_id="1", push_subscriptions=[{"endpoint": "e", "p256dh": "k", "auth": "a"}], purpose="p"
    )

    assert sent.composed == []


async def test_master_notification_splits_title_for_push_and_sends_full_text_to_telegram(
    sent, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "NOTIFICATION_MASTER_LANGUAGE", "Russian")

    await notifications.notify_master(
        telegram_chat_id="42",
        push_subscriptions=[{"endpoint": "https://push/1", "p256dh": "k", "auth": "a"}],
        purpose="p",
    )

    assert sent.composed[0]["language"] == "Russian" and sent.composed[0]["with_title"] is True
    assert sent.telegram == [("42", "Tytuł\n\nTreść wiadomości")]
    assert sent.push == [("https://push/1", {"title": "Tytuł", "body": "Treść wiadomości"})]


async def test_reply_telegram_skipped_without_token(sent, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "")

    await notifications.reply_telegram(chat_id="42", purpose="p")

    assert sent.composed == [] and sent.telegram == []


async def test_run_in_background_runs_to_completion():
    done = []

    async def job():
        done.append(1)

    notifications.run_in_background(job())
    for task in list(notifications._background_tasks):
        await task

    assert done == [1]


# --- охрана: в коде нет готовых текстов уведомлений ------------------------------

_NOTIFY_CALLS = {
    "send_sms",
    "send_telegram_message",
    "send_web_push",
    "notify_client_sms",
    "notify_master",
    "reply_telegram",
}
_CYRILLIC = re.compile(r"[А-Яа-яЁё]")


def _call_name(node: ast.Call) -> str | None:
    f = node.func
    return f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else None


@pytest.mark.parametrize("path", sorted(Path("app").glob("*.py")), ids=lambda p: p.name)
def test_no_cyrillic_text_literals_passed_to_notification_calls(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    offenders = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and _call_name(node) in _NOTIFY_CALLS:
            for sub in ast.walk(node):
                if isinstance(sub, ast.Constant) and isinstance(sub.value, str) and _CYRILLIC.search(sub.value):
                    offenders.append(f"{path}:{sub.lineno}: {sub.value[:50]!r}")
    assert not offenders, "notification text must come from the LLM, not from code:\n" + "\n".join(offenders)
