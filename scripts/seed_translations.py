"""Data migration for Этап 3 (docs/ai-and-reviews.md §1) — seeds the initial
pl/ru/uk translation_entry rows (namespace='ui') plus the per-locale service
name columns for the one currently-seeded service ("Сборка мебели"). A data
migration on top of what's already applied, not an edit of anything by hand —
same discipline the decision doc calls for.

Idempotent (upsert by (namespace, key, lang), and by service id for the
name_* columns) — safe to run again after adding/correcting a key.

These are an AI-produced first pass (ru is the pre-existing human-written
copy; pl/uk are translations of it), seeded straight to status='approved' at
your explicit request so the site is multilingual immediately rather than
waiting on a review pass — correct any of them later via
PUT /admin/translations + POST /admin/translations/approve (ADMIN_SECRET),
no redeploy needed. Native-speaker review of the pl copy in particular is
worth doing before this gets real traffic — automated translation of short
UI strings is usually fine but not infallible.

Run once against a DB: python -m scripts.seed_translations
The live process only picks up new/changed *approved* rows from the
in-memory cache on its next startup (see app/translations.py) — this script
writes straight to Postgres, it doesn't reach into a running process. That's
fine here: this runs as part of the same deploy that ships the code needing
these strings, so the restart that deploy triggers loads them anyway.
"""

import asyncio
import uuid

from sqlalchemy import select

from app.db import async_session_factory
from app.models import Service, TranslationEntry, Tenant

NAMESPACE = "ui"

# (key, ru, pl, uk) — ru is the pre-existing copy from lib/i18n.ts, kept
# byte-for-byte so nothing changes for the current default. Parameterized
# strings use {name} placeholders matching lib/i18n.ts's function args.
ENTRIES: list[tuple[str, str, str, str]] = [
    ("loading", "Загрузка…", "Ładowanie…", "Завантаження…"),
    (
        "catalogLoadError",
        "Не удалось загрузить услуги. Проверьте связь и обновите страницу.",
        "Nie udało się załadować usług. Sprawdź połączenie i odśwież stronę.",
        "Не вдалося завантажити послуги. Перевірте з'єднання та оновіть сторінку.",
    ),
    ("pickServiceTitle", "Выберите услугу", "Wybierz usługę", "Оберіть послугу"),
    ("changeService", "← сменить услугу", "← zmień usługę", "← змінити послугу"),
    ("durationMinutes", "{n} мин", "{n} min", "{n} хв"),
    ("slotsLoading", "Загрузка слотов…", "Ładowanie terminów…", "Завантаження слотів…"),
    (
        "slotsLoadError",
        "Не удалось загрузить свободные слоты.",
        "Nie udało się załadować wolnych terminów.",
        "Не вдалося завантажити вільні слоти.",
    ),
    (
        "noSlotsInRange",
        "На ближайшие {days} дней свободных слотов нет.",
        "W ciągu najbliższych {days} dni nie ma wolnych terminów.",
        "На найближчі {days} днів вільних слотів немає.",
    ),
    ("namePlaceholder", "Ваше имя", "Twoje imię", "Ваше ім'я"),
    ("phonePlaceholder", "Телефон (для SMS о записи)", "Telefon (SMS z potwierdzeniem)", "Телефон (для SMS про запис)"),
    ("submitBooking", "Подтвердить запись", "Potwierdź rezerwację", "Підтвердити запис"),
    ("submitting", "Отправка…", "Wysyłanie…", "Надсилання…"),
    (
        "slotTakenError",
        "Это время только что заняли. Выберите другой слот.",
        "Ten termin właśnie zajęto. Wybierz inny.",
        "Цей час щойно зайняли. Оберіть інший слот.",
    ),
    (
        "genericSubmitError",
        "Не удалось создать запись. Попробуйте ещё раз.",
        "Nie udało się utworzyć rezerwacji. Spróbuj ponownie.",
        "Не вдалося створити запис. Спробуйте ще раз.",
    ),
    ("bookingCreatedTitle", "Запись создана", "Rezerwacja utworzona", "Запис створено"),
    (
        "bookingPending",
        "Мастер подтвердит запись в ближайшее время.",
        "Mistrz wkrótce potwierdzi rezerwację.",
        "Майстер незабаром підтвердить запис.",
    ),
    ("bookingConfirmed", "Запись подтверждена.", "Rezerwacja potwierdzona.", "Запис підтверджено."),
    ("bookAgain", "Записаться ещё раз", "Zarezerwuj ponownie", "Записатися ще раз"),
    ("today", "Сегодня", "Dziś", "Сьогодні"),
    ("tomorrow", "Завтра", "Jutro", "Завтра"),
    ("priceFrom", "от {v} zł", "od {v} zł", "від {v} zł"),
    ("priceRange", "{min}–{max} zł", "{min}–{max} zł", "{min}–{max} zł"),
    ("callOutFeeLine", "+ выезд {fee} zł", "+ dojazd {fee} zł", "+ виїзд {fee} zł"),
    ("pageTitle", "Мастер на час — запись", "Złota Rączka — rezerwacja", "Майстер на годину — запис"),
    (
        "pageDescription",
        "Онлайн-запись на услуги мастера — слоты в реальном времени",
        "Rezerwacja online usług fachowca — terminy w czasie rzeczywistym",
        "Онлайн-запис на послуги майстра — слоти в реальному часі",
    ),
    ("defaultMasterName", "мастер", "fachowiec", "майстер"),
    ("cabinetLink", "Кабинет мастера", "Panel mistrza", "Кабінет майстра"),
    ("cabinetLoading", "Загрузка кабинета…", "Ładowanie panelu…", "Завантаження кабінету…"),
    ("cabinetLoginTitle", "Вход для мастера", "Logowanie dla mistrza", "Вхід для майстра"),
    ("emailPlaceholder", "Email", "Email", "Email"),
    ("passwordPlaceholder", "Пароль", "Hasło", "Пароль"),
    ("loginButton", "Войти", "Zaloguj się", "Увійти"),
    ("loggingIn", "Вход…", "Logowanie…", "Вхід…"),
    ("loginError", "Неверный email или пароль.", "Nieprawidłowy email lub hasło.", "Невірний email або пароль."),
    (
        "loginGenericError",
        "Не удалось войти. Проверьте связь и попробуйте ещё раз.",
        "Nie udało się zalogować. Sprawdź połączenie i spróbuj ponownie.",
        "Не вдалося увійти. Перевірте з'єднання і спробуйте ще раз.",
    ),
    ("logoutButton", "Выйти", "Wyloguj się", "Вийти"),
    ("backToBooking", "← на страницу записи", "← do strony rezerwacji", "← на сторінку запису"),
    ("cabinetTitle", "Кабинет — {name}", "Panel — {name}", "Кабінет — {name}"),
    (
        "cabinetLoadError",
        "Не удалось загрузить данные кабинета. Обновите страницу.",
        "Nie udało się załadować danych panelu. Odśwież stronę.",
        "Не вдалося завантажити дані кабінету. Оновіть сторінку.",
    ),
    ("settingsTitle", "Настройки", "Ustawienia", "Налаштування"),
    (
        "requiresConfirmationLabel",
        "Подтверждать брони вручную",
        "Potwierdzaj rezerwacje ręcznie",
        "Підтверджувати брони вручну",
    ),
    (
        "requiresConfirmationHint",
        "Включено — новая запись сначала ждёт вашего подтверждения. Выключено — подтверждается сразу при создании.",
        "Włączone — nowa rezerwacja najpierw czeka na Twoje potwierdzenie. Wyłączone — potwierdza się od razu.",
        "Увімкнено — новий запис спершу чекає на ваше підтвердження. Вимкнено — підтверджується одразу під час створення.",
    ),
    (
        "settingsSaveError",
        "Не удалось сохранить настройку. Попробуйте ещё раз.",
        "Nie udało się zapisać ustawienia. Spróbuj ponownie.",
        "Не вдалося зберегти налаштування. Спробуйте ще раз.",
    ),
    ("callOutFeeLabel", "Плата за выезд (zł)", "Opłata za dojazd (zł)", "Плата за виїзд (zł)"),
    (
        "callOutFeeHint",
        "Отдельная строка поверх цены услуги на странице записи. Оставьте пустым, если не берёте отдельно.",
        "Osobna pozycja ponad ceną usługi na stronie rezerwacji. Zostaw puste, jeśli nie pobierasz oddzielnie.",
        "Окремий рядок поверх ціни послуги на сторінці запису. Залиште порожнім, якщо не берете окремо.",
    ),
    ("callOutFeePlaceholder", "Не задано", "Nie ustawiono", "Не задано"),
    ("servicesOfferedTitle", "Мои услуги", "Moje usługi", "Мої послуги"),
    (
        "servicesOfferedHint",
        "Отметьте, какие услуги вы оказываете — они появятся у клиентов на странице записи.",
        "Zaznacz, jakie usługi oferujesz — pojawią się u klientów na stronie rezerwacji.",
        "Позначте, які послуги ви надаєте — вони з'являться у клієнтів на сторінці запису.",
    ),
    ("noActiveServices", "В каталоге пока нет активных услуг.", "W katalogu nie ma jeszcze aktywnych usług.", "У каталозі поки немає активних послуг."),
    (
        "servicesSaveError",
        "Не удалось сохранить список услуг. Попробуйте ещё раз.",
        "Nie udało się zapisać listy usług. Spróbuj ponownie.",
        "Не вдалося зберегти список послуг. Спробуйте ще раз.",
    ),
    ("bookingsTitle", "Брони", "Rezerwacje", "Броні"),
    ("noBookings", "Броней пока нет.", "Nie ma jeszcze rezerwacji.", "Броней поки немає."),
    ("confirmBookingButton", "Подтвердить", "Potwierdź", "Підтвердити"),
    ("cancelBookingButton", "Отменить", "Anuluj", "Скасувати"),
    (
        "bookingActionError",
        "Не удалось изменить статус брони. Попробуйте ещё раз.",
        "Nie udało się zmienić statusu rezerwacji. Spróbuj ponownie.",
        "Не вдалося змінити статус броні. Спробуйте ще раз.",
    ),
    ("bookingStatus.pending", "Ждёт подтверждения", "Oczekuje na potwierdzenie", "Очікує підтвердження"),
    ("bookingStatus.confirmed", "Подтверждено", "Potwierdzone", "Підтверджено"),
    ("bookingStatus.completed", "Завершено", "Zakończone", "Завершено"),
    ("bookingStatus.cancelled", "Отменено", "Anulowane", "Скасовано"),
    ("bookingStatus.no_show", "Клиент не пришёл", "Klient się nie pojawił", "Клієнт не прийшов"),
]

SERVICE_NAME_TRANSLATIONS = {
    "Сборка мебели": {"ru": "Сборка мебели", "pl": "Montaż mebli", "uk": "Збирання меблів"},
}


async def main() -> None:
    async with async_session_factory() as db:
        upserted = 0
        for key, ru, pl, uk in ENTRIES:
            for lang, text in (("ru", ru), ("pl", pl), ("uk", uk)):
                existing = (
                    await db.execute(
                        select(TranslationEntry).where(
                            TranslationEntry.namespace == NAMESPACE,
                            TranslationEntry.key == key,
                            TranslationEntry.lang == lang,
                        )
                    )
                ).scalar_one_or_none()
                if existing is None:
                    db.add(
                        TranslationEntry(
                            id=uuid.uuid4(), namespace=NAMESPACE, key=key, lang=lang, text=text, status="approved"
                        )
                    )
                else:
                    existing.text = text
                    existing.status = "approved"
                upserted += 1
        print(f"upserted {upserted} translation_entry rows ({len(ENTRIES)} keys x 3 langs)")

        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "master-na-chas"))).scalar_one_or_none()
        if tenant is not None:
            for name, per_lang in SERVICE_NAME_TRANSLATIONS.items():
                service = (
                    await db.execute(
                        select(Service).where(Service.tenant_id == tenant.id, Service.name == name)
                    )
                ).scalar_one_or_none()
                if service is not None:
                    service.name_ru = per_lang["ru"]
                    service.name_pl = per_lang["pl"]
                    service.name_uk = per_lang["uk"]
                    print(f"set name_pl/name_ru/name_uk for service {name!r}")
                else:
                    print(f"service {name!r} not found — skipping (seed.py may not have run yet)")

        await db.commit()
        print("seed_translations done.")


if __name__ == "__main__":
    asyncio.run(main())
