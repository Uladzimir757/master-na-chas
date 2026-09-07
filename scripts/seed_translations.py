"""Data migration for Этап 3 (docs/ai-and-reviews.md §1) — seeds the
translation_entry rows (namespace='ui') for pl + en (see SUPPORTED_LANGS in
app/translations.py: ru/uk were the original launch languages, now turned
off by explicit request — their previously-seeded rows are simply left in
place, unreachable, not deleted).

Service catalog names (Service.name_pl/_ru/_uk/_en) are seeded separately —
see scripts/seed_services.py — not here any more.

Idempotent (upsert by (namespace, key, lang)) — safe to run again after
adding/correcting a key.

pl is the pre-existing human-written copy (the real Trójmiasto audience);
en is an AI-produced first pass, seeded straight to status='approved' at
your explicit request so the site is bilingual immediately rather than
waiting on a review pass — correct any of them later via
PUT /admin/translations + POST /admin/translations/approve (ADMIN_SECRET),
no redeploy needed.

Run once against a DB: python -m scripts.seed_translations
The live process only picks up new/changed *approved* rows from the
in-memory cache on its next startup (see app/translations.py) — this script
writes straight to Postgres, it doesn't reach into a running process. That's
fine here: this runs as part of the same deploy that ships the code needing
these strings, so the restart that deploy triggers loads them anyway.
"""

import asyncio
import sys
import uuid

from sqlalchemy import select

# Windows consoles default to a codepage (e.g. cp1250) that can't encode some
# of the entries below — without this, the print()s further down raise
# UnicodeEncodeError *before* the db.commit() call, silently discarding the
# whole upsert.
if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from app.db import async_session_factory
from app.models import TranslationEntry

NAMESPACE = "ui"

# (key, pl, en). Parameterized strings use {name} placeholders matching
# lib/i18n.ts's function args.
ENTRIES: list[tuple[str, str, str]] = [
    ("brandName", "Złota Rączka", "Złota Rączka"),
    ("heroTitle", "Fachowiec pod ręką, kiedy potrzebujesz", "A handyman on call, whenever you need one"),
    (
        "heroSubtitle",
        "Montaż mebli, drobne naprawy i instalacje — rezerwacja wolnego terminu w kilka minut",
        "Furniture assembly, small repairs and installations — book a free slot in a couple of minutes",
    ),
    ("timeOfDayMorning", "Rano", "Morning"),
    ("timeOfDayAfternoon", "Popołudnie", "Afternoon"),
    ("timeOfDayEvening", "Wieczór", "Evening"),
    ("continueToFormButton", "Przejdź do rezerwacji", "Continue to booking"),
    ("loading", "Ładowanie…", "Loading…"),
    (
        "catalogLoadError",
        "Nie udało się załadować usług. Sprawdź połączenie i odśwież stronę.",
        "Couldn't load services. Check your connection and refresh the page.",
    ),
    ("pickServiceTitle", "Wybierz usługę", "Choose a service"),
    ("changeService", "← zmień usługę", "← change service"),
    ("durationMinutes", "{n} min", "{n} min"),
    ("slotsLoading", "Ładowanie terminów…", "Loading time slots…"),
    ("slotsLoadError", "Nie udało się załadować wolnych terminów.", "Couldn't load available time slots."),
    (
        "noSlotsInRange",
        "W ciągu najbliższych {days} dni nie ma wolnych terminów.",
        "No available slots in the next {days} days.",
    ),
    ("namePlaceholder", "Twoje imię", "Your name"),
    ("phonePlaceholder", "Telefon (SMS z potwierdzeniem)", "Phone (for a confirmation SMS)"),
    ("submitBooking", "Potwierdź rezerwację", "Confirm booking"),
    ("submitting", "Wysyłanie…", "Submitting…"),
    ("slotTakenError", "Ten termin właśnie zajęto. Wybierz inny.", "This time slot was just taken. Please choose another."),
    (
        "genericSubmitError",
        "Nie udało się utworzyć rezerwacji. Spróbuj ponownie.",
        "Couldn't create the booking. Please try again.",
    ),
    ("bookingCreatedTitle", "Rezerwacja utworzona", "Booking created"),
    ("bookingPending", "Mistrz wkrótce potwierdzi rezerwację.", "The specialist will confirm your booking shortly."),
    ("bookingConfirmed", "Rezerwacja potwierdzona.", "Booking confirmed."),
    ("bookAgain", "Zarezerwuj ponownie", "Book again"),
    ("today", "Dziś", "Today"),
    ("tomorrow", "Jutro", "Tomorrow"),
    ("priceFrom", "od {v} zł", "from {v} zł"),
    ("priceRange", "{min}–{max} zł", "{min}–{max} zł"),
    ("callOutFeeLine", "+ dojazd {fee} zł", "+ call-out fee {fee} zł"),
    ("pageTitle", "Złota Rączka — rezerwacja", "Złota Rączka — booking"),
    (
        "pageDescription",
        "Rezerwacja online usług fachowca — terminy w czasie rzeczywistym",
        "Online booking for handyman services — real-time availability",
    ),
    ("defaultMasterName", "fachowiec", "specialist"),
    ("cabinetLink", "Panel mistrza", "Specialist panel"),
    ("cabinetLoading", "Ładowanie panelu…", "Loading panel…"),
    ("cabinetLoginTitle", "Logowanie dla mistrza", "Specialist login"),
    ("emailPlaceholder", "Email", "Email"),
    ("passwordPlaceholder", "Hasło", "Password"),
    ("showPassword", "Pokaż hasło", "Show password"),
    ("hidePassword", "Ukryj hasło", "Hide password"),
    ("loginButton", "Zaloguj się", "Log in"),
    ("loggingIn", "Logowanie…", "Logging in…"),
    ("loginError", "Nieprawidłowy email lub hasło.", "Incorrect email or password."),
    (
        "loginGenericError",
        "Nie udało się zalogować. Sprawdź połączenie i spróbuj ponownie.",
        "Couldn't log in. Check your connection and try again.",
    ),
    ("logoutButton", "Wyloguj się", "Log out"),
    ("backToBooking", "← do strony rezerwacji", "← back to booking"),
    ("cabinetTitle", "Panel — {name}", "Panel — {name}"),
    ("cabinetLoadError", "Nie udało się załadować danych panelu. Odśwież stronę.", "Couldn't load panel data. Please refresh the page."),
    ("settingsTitle", "Ustawienia", "Settings"),
    ("requiresConfirmationLabel", "Potwierdzaj rezerwacje ręcznie", "Confirm bookings manually"),
    (
        "requiresConfirmationHint",
        "Włączone — nowa rezerwacja najpierw czeka na Twoje potwierdzenie. Wyłączone — potwierdza się od razu.",
        "On — a new booking first waits for your confirmation. Off — it's confirmed right away.",
    ),
    ("settingsSaveError", "Nie udało się zapisać ustawienia. Spróbuj ponownie.", "Couldn't save the setting. Please try again."),
    ("callOutFeeLabel", "Opłata za dojazd (zł)", "Call-out fee (zł)"),
    (
        "callOutFeeHint",
        "Osobna pozycja ponad ceną usługi na stronie rezerwacji. Zostaw puste, jeśli nie pobierasz oddzielnie.",
        "Shown as a separate line above the service price on the booking page. Leave blank if you don't charge it separately.",
    ),
    ("callOutFeePlaceholder", "Nie ustawiono", "Not set"),
    ("servicesOfferedTitle", "Moje usługi", "My services"),
    (
        "servicesOfferedHint",
        "Zaznacz, jakie usługi oferujesz, i ustaw swoją cenę — pojawią się u klientów na stronie rezerwacji.",
        "Tick the services you offer and set your own price — they'll appear for clients on the booking page.",
    ),
    ("noActiveServices", "W katalogu nie ma jeszcze aktywnych usług.", "There are no active services in the catalog yet."),
    ("servicesSaveError", "Nie udało się zapisać listy usług. Spróbuj ponownie.", "Couldn't save your services. Please try again."),
    ("bookingsTitle", "Rezerwacje", "Bookings"),
    ("noBookings", "Nie ma jeszcze rezerwacji.", "No bookings yet."),
    ("confirmBookingButton", "Potwierdź", "Confirm"),
    ("cancelBookingButton", "Anuluj", "Cancel"),
    (
        "bookingActionError",
        "Nie udało się zmienić statusu rezerwacji. Spróbuj ponownie.",
        "Couldn't update the booking status. Please try again.",
    ),
    ("bookingStatus.pending", "Oczekuje na potwierdzenie", "Awaiting confirmation"),
    ("bookingStatus.confirmed", "Potwierdzone", "Confirmed"),
    ("bookingStatus.completed", "Zakończone", "Completed"),
    ("bookingStatus.cancelled", "Anulowane", "Cancelled"),
    ("bookingStatus.no_show", "Klient się nie pojawił", "Client didn't show up"),
    # Этап 4 — live location dot (Provider.share_location).
    ("shareLocationLabel", "Pokazuj klientom moją lokalizację", "Show my location to clients"),
    (
        "shareLocationHint",
        "Punkt na mapie widzą klienci tylko wtedy, gdy ta strona jest otwarta w Twojej przeglądarce i trwają Twoje godziny pracy.",
        "Clients only see the map point while this page is open in your browser and it's currently your working hours.",
    ),
    ("locationSharingActive", "Lokalizacja jest udostępniana", "Location is being shared"),
    ("locationSharingWaiting", "Ustalamy Twoją lokalizację…", "Determining your location…"),
    (
        "locationSharingDenied",
        "Brak dostępu do lokalizacji — zezwól na nią w ustawieniach przeglądarki.",
        "No access to location — allow it in your browser settings.",
    ),
    ("locationSharingUnsupported", "Ta przeglądarka nie obsługuje geolokalizacji.", "This browser doesn't support geolocation."),
    ("locationSharingError", "Nie udało się ustalić lokalizacji.", "Couldn't determine your location."),
    ("masterLocationTitle", "Mistrz jest teraz tutaj", "The specialist is here now"),
    ("masterLocationJustNow", "Przed chwilą", "Just now"),
    ("masterLocationMinutesAgo", "{n} min temu", "{n} min ago"),
    # "Занят сейчас" — general busy toggle (Provider.busy_started_at), see
    # components/CabinetDashboard.tsx.
    ("busyTitle", "Zajęty teraz", "Busy right now"),
    (
        "busyHint",
        "Zaznacz to, gdy zaczynasz pracę — godziny w kalendarzu zostaną zamknięte dla nowych rezerwacji, dopóki nie klikniesz „Zakończ”.",
        'Tick this when you start a job — calendar hours close to new bookings until you press "Finish".',
    ),
    ("startBusyButton", "Zacznij", "Start"),
    ("finishBusyButton", "Zakończ", "Finish"),
    ("busyStatusSince", "Jesteś zajęty od {time}", "You've been busy since {time}"),
    ("busyUntilText", "Prawdopodobnie będziesz wolny o {time}", "You'll likely be free around {time}"),
    (
        "busyOpenEndedNote",
        "Bez podania czasu godziny pozostaną zamknięte, dopóki nie klikniesz „Zakończ”.",
        'Without an estimate, hours stay closed until you press "Finish".',
    ),
    ("busyEstimateLabel", "Szacowany czas pracy (min)", "Estimated work time (min)"),
    (
        "busyEstimateHint",
        "Podaj — a po tym czasie plus 30 minut godziny znów otworzą się na rezerwacje.",
        "Set it, and hours reopen for booking after that time plus 30 minutes.",
    ),
    ("busyEstimatePlaceholder", "np. 60", "e.g. 60"),
    ("busyActionError", "Nie udało się zaktualizować statusu. Spróbuj ponownie.", "Couldn't update the status. Please try again."),
    # Master changing their own password — components/CabinetDashboard.tsx.
    ("changePasswordTitle", "Zmień hasło", "Change password"),
    ("currentPasswordPlaceholder", "Obecne hasło", "Current password"),
    ("newPasswordPlaceholder", "Nowe hasło", "New password"),
    ("confirmNewPasswordPlaceholder", "Powtórz nowe hasło", "Repeat new password"),
    ("changePasswordButton", "Zmień hasło", "Change password"),
    ("changingPassword", "Zapisywanie…", "Saving…"),
    ("changePasswordSuccess", "Hasło zostało zmienione.", "Password changed."),
    ("changePasswordMismatchError", "Hasła się nie zgadzają.", "Passwords don't match."),
    (
        "changePasswordTooShortError",
        "Nowe hasło musi mieć co najmniej 8 znaków.",
        "The new password must be at least 8 characters.",
    ),
    ("changePasswordWrongCurrentError", "Nieprawidłowe obecne hasło.", "Incorrect current password."),
    (
        "changePasswordGenericError",
        "Nie udało się zmienić hasła. Spróbuj ponownie.",
        "Couldn't change the password. Please try again.",
    ),
    # Master picker (this segment) — the home page now opens on a list of
    # masters (sorted by rating) instead of jumping straight into the
    # calendar, see components/MasterPicker.tsx.
    ("pickMasterTitle", "Wybierz mistrza", "Choose a specialist"),
    ("masterListLoadError", "Nie udało się załadować listy mistrzów.", "Couldn't load the list of specialists."),
    ("ratingValue", "★ {rating} ({count})", "★ {rating} ({count})"),
    ("noRatingYet", "Brak ocen", "No ratings yet"),
    ("chooseMasterButton", "Wybierz", "Choose"),
    ("backToMasters", "← wybierz innego mistrza", "← choose a different specialist"),
    ("masterServicesLoadError", "Nie udało się załadować usług tego mistrza.", "Couldn't load this specialist's services."),
    (
        "noServicesOffered",
        "Ten mistrz nie wybrał jeszcze żadnej usługi.",
        "This specialist hasn't selected any services yet.",
    ),
    # Per-service price/description, set by the master — same section as
    # servicesOfferedTitle above (components/CabinetDashboard.tsx).
    ("servicePriceMinPlaceholder", "Cena od", "Price from"),
    ("servicePriceMaxPlaceholder", "Cena do", "Price to"),
    ("serviceDescriptionPlaceholder", "Opis usługi (opcjonalnie)", "Service description (optional)"),
]


async def main() -> None:
    async with async_session_factory() as db:
        upserted = 0
        for key, pl, en in ENTRIES:
            for lang, text in (("pl", pl), ("en", en)):
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
        print(f"upserted {upserted} translation_entry rows ({len(ENTRIES)} keys x 2 langs)")

        await db.commit()
        print("seed_translations done.")


if __name__ == "__main__":
    asyncio.run(main())
