"""Живая проверка app/llm_text.py против реального Claude API.

Нужен ключ выбранного провайдера в .env (NOTIFICATION_LLM_PROVIDER: OPENAI_API_KEY
или ANTHROPIC_API_KEY). Тратит ~3 коротких вызова.
Запуск: python -m scripts.smoke_llm_text

Проверяет то, что юнит-тесты подменяют: что параметры запроса (модель,
fallbacks, output_config) принимает API и что ответ проходит проверки
compose_message — иначе в бою уведомление молча не уйдёт.
"""

import asyncio
import sys

from app.config import settings
from app.llm_text import _api_key_for, compose_message, language_for_phone

if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

LINK = "https://example.com/review/?booking_id=demo&token=demo"

CASES = [
    dict(
        recipient="client",
        purpose="Confirm to the client that the booking request was received for the given service and time.",
        facts={"service": "Montaż mebli", "date": "2026-10-12", "weekday": "Monday", "time": "10:30"},
        language=language_for_phone("+48501234567"),
        max_chars=300,
    ),
    dict(
        recipient="client",
        purpose="Tell the client the job is done and invite them to rate the work using the link.",
        facts={"master": "Jan", "service": "Montaż mebli"},
        language=language_for_phone("+44 7700 900123"),
        max_chars=300,
        must_include=LINK,
    ),
    dict(
        recipient="master",
        purpose="Tell the master that a client has just booked a new job and give the job, the time and how to reach the client.",
        facts={
            "service": "Montaż mebli",
            "date": "2026-10-12",
            "weekday": "Monday",
            "time": "10:30",
            "client_name": "Anna Kowalska",
            "client_phone": "+48501234567",
        },
        language=settings.NOTIFICATION_MASTER_LANGUAGE,
        max_chars=400,
        with_title=True,
    ),
]


async def main() -> int:
    provider = settings.NOTIFICATION_LLM_PROVIDER
    if not _api_key_for(provider):
        print(f"ключ провайдера {provider!r} не задан — проверять нечего")
        return 1
    if provider == "openai":
        print(f"provider=openai model={settings.NOTIFICATION_OPENAI_MODEL}")
    else:
        print(
            f"provider=anthropic model={settings.NOTIFICATION_LLM_MODEL} "
            f"fallback={settings.NOTIFICATION_LLM_FALLBACK_MODEL or '-'}"
        )
    failed = 0
    for case in CASES:
        text = await compose_message(**case)
        print(f"\n[{case['recipient']} / {case['language']}]")
        print(text if text else "!! None — смотри лог выше")
        failed += text is None
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
