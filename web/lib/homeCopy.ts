import type { LocaleCode } from "@/lib/locale";

// Static marketing copy for the home page's hero, trust line and "how it works"
// block. Kept here rather than in the backend's translation_entry table
// (lib/i18n.ts) so this page's look can ship without touching the database.
// heroTitle/heroSubtitle/cta mirror scripts/seed_translations.py and only show
// until the real translations load.
const COPY = {
  pl: {
    kicker: "Gdynia · Trójmiasto",
    heroTitle: "Fachowiec pod ręką, kiedy potrzebujesz",
    heroSubtitle:
      "Montaż mebli, drobne naprawy i instalacje — rezerwacja wolnego terminu w kilka minut",
    cta: "Wybierz mistrza",
    trust: ["Wolne terminy na żywo", "Rezerwacja bez zakładania konta", "Oceny mistrzów"],
    howTitle: "Jak to działa",
    steps: [
      { title: "Wybierz mistrza", text: "Porównaj oceny i ceny, a potem wybierz usługę." },
      { title: "Wybierz termin", text: "Widzisz tylko godziny, które są naprawdę wolne." },
      { title: "Zarezerwuj", text: "Podaj imię i telefon — to wszystko." },
    ],
  },
  en: {
    kicker: "Gdynia · Tricity",
    heroTitle: "A handyman on call, whenever you need one",
    heroSubtitle:
      "Furniture assembly, small repairs and installations — book a free slot in a couple of minutes",
    cta: "Choose a specialist",
    trust: ["Live availability", "Book without an account", "Specialist ratings"],
    howTitle: "How it works",
    steps: [
      { title: "Choose a specialist", text: "Compare ratings and prices, then pick a service." },
      { title: "Choose a time", text: "You only see the hours that are actually free." },
      { title: "Book it", text: "Leave your name and phone number — that's all." },
    ],
  },
} satisfies Record<LocaleCode, unknown>;

export function homeCopy(locale: LocaleCode) {
  return COPY[locale];
}
