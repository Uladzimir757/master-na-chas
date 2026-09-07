"""Real service catalog seed (replaces the single "Сборка мебели" stub from
scripts/seed.py with a real, researched list of "мастер на час" jobs) — run
once against the DB: python -m scripts.seed_services

Идемпотентно и безопасно повторять: matches existing rows by (tenant_id,
name) — the canonical Russian name — and UPDATES duration/price/locale
names in place rather than inserting a duplicate. This matters for
"Сборка мебели" specifically: it's the one service scripts/seed.py already
created and that real (or test) bookings may already reference by
Service.id — this script keeps that exact name so it updates the SAME row
instead of creating a near-duplicate "Сборка мебели (...)" beside it.

Prices here are a reference/suggested range only (Service.price_min/max —
see its docstring in app/models.py) — since this segment, what a client
actually sees is the offering MASTER's own price
(ProviderService.price_min/max), set from the cabinet's services checklist.
These seeded numbers are a sensible Trójmiasto-market starting point (open
listings/aggregators, per the service-catalog handoff's xlsx draft +
general market research), NOT a real price list — adjust per service from
the cabinet once you and your friend have your own numbers.

name_ru/name_pl/name_uk/name_en are all seeded even though ru/uk are
currently turned off (see SUPPORTED_LANGS in app/translations.py) — cheap
to keep filled in for whenever/if they're turned back on, costs nothing
while off.

Every service is inserted/updated with is_active=True but NOT auto-linked
to either provider — offering it is each master's own choice via
GET/PUT /api/providers/me/services in the cabinet (see this segment's
service-catalog handoff for why: "работы должны выбираться мастером из
списка", not be turned on for him by a seed script)."""

import asyncio

from sqlalchemy import select

from app.db import async_session_factory
from app.models import Service, Tenant

CATALOG: list[dict] = [
    # --- Мебель / Furniture ------------------------------------------------
    {
        "ru": "Сборка мебели",
        "pl": "Montaż mebli (IKEA i inne)",
        "uk": "Складання меблів (IKEA та інші)",
        "en": "Furniture assembly",
        "duration": 90,
        "price_min": 100,
        "price_max": 300,
    },
    {
        "ru": "Сборка/монтаж кухни целиком",
        "pl": "Montaż całej kuchni",
        "uk": "Монтаж кухні цілком",
        "en": "Full kitchen assembly/installation",
        "duration": 240,
        "price_min": 1000,
        "price_max": 2500,
    },
    {
        "ru": "Ремонт/регулировка мебельной фурнитуры",
        "pl": "Naprawa/regulacja okuć meblowych",
        "uk": "Ремонт/регулювання меблевої фурнітури",
        "en": "Furniture hardware repair/adjustment",
        "duration": 45,
        "price_min": 80,
        "price_max": 200,
    },
    # --- Электрика / Electrical ---------------------------------------------
    {
        "ru": "Замена розетки/выключателя",
        "pl": "Wymiana gniazdka/włącznika",
        "uk": "Заміна розетки/вимикача",
        "en": "Outlet/switch replacement",
        "duration": 30,
        "price_min": 60,
        "price_max": 150,
    },
    {
        "ru": "Монтаж светильника/люстры",
        "pl": "Montaż lampy/żyrandola",
        "uk": "Монтаж світильника/люстри",
        "en": "Light fixture/chandelier installation",
        "duration": 45,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Диагностика и замена автомата в щитке",
        "pl": "Diagnostyka i wymiana bezpiecznika",
        "uk": "Діагностика і заміна автомата в щитку",
        "en": "Circuit breaker diagnosis and replacement",
        "duration": 45,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Подключение варочной панели/духовки",
        "pl": "Podłączenie płyty indukcyjnej/piekarnika",
        "uk": "Підключення варильної панелі/духовки",
        "en": "Cooktop/oven connection",
        "duration": 60,
        "price_min": 150,
        "price_max": 350,
    },
    # --- Сантехника / Plumbing -----------------------------------------------
    {
        "ru": "Замена смесителя (крана)",
        "pl": "Wymiana baterii (kranu)",
        "uk": "Заміна змішувача (крана)",
        "en": "Faucet replacement",
        "duration": 60,
        "price_min": 120,
        "price_max": 300,
    },
    {
        "ru": "Устранение засора",
        "pl": "Udrożnienie rury/syfonu",
        "uk": "Усунення засору",
        "en": "Clearing a clogged drain",
        "duration": 45,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Ремонт/замена сливного бачка унитаза",
        "pl": "Naprawa/wymiana spłuczki",
        "uk": "Ремонт/заміна зливного бачка унітаза",
        "en": "Toilet cistern repair/replacement",
        "duration": 45,
        "price_min": 150,
        "price_max": 300,
    },
    {
        "ru": "Устранение протечки под мойкой",
        "pl": "Usunięcie przecieku pod zlewem",
        "uk": "Усунення протікання під мийкою",
        "en": "Fixing a leak under the sink",
        "duration": 45,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Установка/замена унитаза",
        "pl": "Montaż/wymiana miski ustępowej",
        "uk": "Встановлення/заміна унітаза",
        "en": "Toilet installation/replacement",
        "duration": 90,
        "price_min": 250,
        "price_max": 500,
    },
    {
        "ru": "Установка душевой кабины (готовый комплект)",
        "pl": "Montaż kabiny prysznicowej (zestaw)",
        "uk": "Встановлення душової кабіни (готовий комплект)",
        "en": "Shower enclosure installation (ready-made kit)",
        "duration": 180,
        "price_min": 500,
        "price_max": 1200,
    },
    {
        "ru": "Герметизация швов силиконом",
        "pl": "Silikonowanie fug",
        "uk": "Герметизація швів силіконом",
        "en": "Silicone joint sealing",
        "duration": 45,
        "price_min": 80,
        "price_max": 200,
    },
    # --- Монтаж/крепёж / Mounting -------------------------------------------
    {
        "ru": "Навеска карниза для штор",
        "pl": "Montaż karnisza",
        "uk": "Навішування карниза для штор",
        "en": "Curtain rod installation",
        "duration": 30,
        "price_min": 80,
        "price_max": 150,
    },
    {
        "ru": "Навеска полки/зеркала",
        "pl": "Montaż półki/lustra",
        "uk": "Навішування полиці/дзеркала",
        "en": "Shelf/mirror mounting",
        "duration": 30,
        "price_min": 50,
        "price_max": 150,
    },
    {
        "ru": "Установка ТВ на кронштейн",
        "pl": "Montaż telewizora na uchwycie",
        "uk": "Встановлення ТВ на кронштейн",
        "en": "TV wall-mount installation",
        "duration": 60,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Монтаж кухонной вытяжки",
        "pl": "Montaż okapu kuchennego",
        "uk": "Монтаж кухонної витяжки",
        "en": "Kitchen range hood installation",
        "duration": 90,
        "price_min": 200,
        "price_max": 450,
    },
    {
        "ru": "Подключение стиральной/посудомоечной машины",
        "pl": "Podłączenie pralki/zmywarki",
        "uk": "Підключення пральної/посудомийної машини",
        "en": "Washing machine/dishwasher connection",
        "duration": 60,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Сборка и установка когтеточки/лежанки для животных",
        "pl": "Montaż drapaka/legowiska dla zwierząt",
        "uk": "Складання і встановлення дряпки/лежанки для тварин",
        "en": "Assembling and installing a pet scratching post/bed",
        "duration": 45,
        "price_min": 60,
        "price_max": 150,
    },
    {
        "ru": "Установка сушилки для белья",
        "pl": "Montaż suszarki na pranie",
        "uk": "Встановлення сушарки для білизни",
        "en": "Laundry drying rack installation",
        "duration": 45,
        "price_min": 80,
        "price_max": 180,
    },
    # --- Двери и окна / Doors and windows ------------------------------------
    {
        "ru": "Регулировка пластиковых окон/дверей",
        "pl": "Regulacja okien/drzwi PVC",
        "uk": "Регулювання пластикових вікон/дверей",
        "en": "PVC window/door adjustment",
        "duration": 45,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Замена/ремонт дверного замка",
        "pl": "Wymiana/naprawa zamka drzwiowego",
        "uk": "Заміна/ремонт дверного замка",
        "en": "Door lock replacement/repair",
        "duration": 45,
        "price_min": 100,
        "price_max": 250,
    },
    {
        "ru": "Утепление окон/дверей на зиму",
        "pl": "Uszczelnianie okien/drzwi na zimę",
        "uk": "Утеплення вікон/дверей на зиму",
        "en": "Winterizing windows/doors (weatherstripping)",
        "duration": 45,
        "price_min": 60,
        "price_max": 150,
    },
    # --- Отделка/мелкий ремонт / Finishing & minor repairs -------------------
    {
        "ru": "Покраска стены/двери (небольшая площадь)",
        "pl": "Malowanie ściany/drzwi (mała powierzchnia)",
        "uk": "Фарбування стіни/дверей (невелика площа)",
        "en": "Painting a wall/door (small area)",
        "duration": 120,
        "price_min": 150,
        "price_max": 400,
    },
    {
        "ru": "Мелкий ремонт стен (штукатурка, шпаклёвка)",
        "pl": "Drobna naprawa ścian (tynkowanie, szpachlowanie)",
        "uk": "Дрібний ремонт стін",
        "en": "Minor wall repair (plastering, filling)",
        "duration": 90,
        "price_min": 120,
        "price_max": 300,
    },
    {
        "ru": "Замена нескольких треснувших плиток",
        "pl": "Wymiana pojedynczych pękniętych płytek",
        "uk": "Заміна кількох тріснутих плиток",
        "en": "Replacing a few cracked tiles",
        "duration": 60,
        "price_min": 100,
        "price_max": 250,
    },
    # --- Разное / Miscellaneous -----------------------------------------------
    {
        "ru": "Сборка детской площадки/качелей",
        "pl": "Montaż placu zabaw/huśtawki",
        "uk": "Складання дитячого майданчика/гойдалки",
        "en": "Assembling a playset/swing",
        "duration": 120,
        "price_min": 200,
        "price_max": 500,
    },
    {
        "ru": "Чистка водостоков (одноэтажный дом)",
        "pl": "Czyszczenie rynien (dom parterowy)",
        "uk": "Чищення водостоків (одноповерховий будинок)",
        "en": "Gutter cleaning (single-storey house)",
        "duration": 90,
        "price_min": 150,
        "price_max": 350,
    },
    {
        "ru": "Мелкий ремонт по дому (почасово)",
        "pl": "Drobne naprawy domowe (rozliczenie godzinowe)",
        "uk": "Дрібний ремонт по дому (погодинно)",
        "en": "Minor home repairs (hourly rate)",
        "duration": 60,
        "price_min": 120,
        "price_max": None,
    },
]


async def main() -> None:
    async with async_session_factory() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "master-na-chas"))).scalar_one_or_none()
        if tenant is None:
            print("No tenant found — run scripts/seed.py first.")
            return

        created, updated = 0, 0
        for item in CATALOG:
            service = (
                await db.execute(select(Service).where(Service.tenant_id == tenant.id, Service.name == item["ru"]))
            ).scalar_one_or_none()
            if service is None:
                db.add(
                    Service(
                        tenant_id=tenant.id,
                        name=item["ru"],
                        name_ru=item["ru"],
                        name_pl=item["pl"],
                        name_uk=item["uk"],
                        name_en=item["en"],
                        duration_minutes=item["duration"],
                        price_min=item["price_min"],
                        price_max=item["price_max"],
                    )
                )
                created += 1
            else:
                service.name_ru = item["ru"]
                service.name_pl = item["pl"]
                service.name_uk = item["uk"]
                service.name_en = item["en"]
                service.duration_minutes = item["duration"]
                service.price_min = item["price_min"]
                service.price_max = item["price_max"]
                updated += 1

        await db.commit()
        print(f"seed_services done: {created} created, {updated} updated, {len(CATALOG)} total in catalog")


if __name__ == "__main__":
    asyncio.run(main())
