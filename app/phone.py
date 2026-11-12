"""Проверка и нормализация телефона клиента (решение 12.11.2026: раньше
проходил любой текст, например «1234»).

Принимаем:
- польский номер из 9 цифр (первая не 0) — с +48 / 0048 или без кода;
- иностранный в международном формате: «+» или «00», затем 8–15 цифр.
Пробелы, дефисы, скобки и точки игнорируются. Храним в виде E.164
(«+48600111222») — по нему же сверяется история заказов клиента, так что
«600 111 222» и «+48600111222» больше не разные клиенты.
Та же логика на фронте — web/lib/phone.ts.
"""

from __future__ import annotations

import re

_SEPARATORS = re.compile(r"[\s\-().]")


def normalize_phone(raw: str | None) -> str | None:
    """None/пусто → None; неверный номер → ValueError."""
    if raw is None:
        return None
    s = _SEPARATORS.sub("", raw)
    if not s:
        return None
    if s.startswith("00"):
        s = "+" + s[2:]
    if s.startswith("+"):
        digits = s[1:]
        if not digits.isdigit():
            raise ValueError("invalid phone number")
        if digits.startswith("48"):
            local = digits[2:]
            if len(local) == 9 and local[0] != "0":
                return "+" + digits
            raise ValueError("invalid phone number")
        if 8 <= len(digits) <= 15 and digits[0] != "0":
            return "+" + digits
        raise ValueError("invalid phone number")
    if s.isdigit() and len(s) == 9 and s[0] != "0":
        return "+48" + s
    raise ValueError("invalid phone number")
