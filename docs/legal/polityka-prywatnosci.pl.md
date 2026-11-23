> **UWAGA ROBOCZA — NIE PUBLIKOWAĆ BEZ WERYFIKACJI PRAWNEJ**
> To jest szkic przygotowany jako punkt wyjścia do rozmowy z prawnikiem/radcą specjalizującym się w RODO. Dane Administratora są **placeholderami** — spółka (sp. z o.o. / PSA) nie jest jeszcze zarejestrowana. Przed publikacją należy: (1) uzupełnić dane Administratora po rejestracji spółki, (2) zweryfikować listę faktycznie używanych podwykonawców/narzędzi (Twilio, Render, Neon, Firebase/FCM, dostawca LLM) i podstawy transferu danych poza EOG, (3) potwierdzić okresy przechowywania z prawnikiem, (4) dopasować do ostatecznej nazwy marki/domeny (obecnie roboczo "ZR" / tadyhome / docelowa nazwa jeszcze nieustalona).

---

**Polityka prywatności — ZR (Złota Rączka)**

Niniejsza Polityka Prywatności zawiera informacje dotyczące przetwarzania danych osobowych przez **[NAZWA SPÓŁKI W ORGANIZACJI — do uzupełnienia po rejestracji]** z siedzibą w Gdyni, ul. [●], NIP: [●], KRS: [●] (dalej: **"ZR"**, **"Administrator"** lub **"my"**), w zakresie, w jakim przetwarzamy dane osobowe jako ich administrator w rozumieniu art. 4 pkt 7 RODO (Rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r.).

Do czasu zarejestrowania spółki kontakt w sprawach danych osobowych: **[adres e-mail do uzupełnienia — rekomendowany dedykowany adres typu privacy@... lub kontakt@..., nie prywatna skrzynka]**.

Jeśli masz pytania dotyczące przetwarzania Twoich danych osobowych, napisz na adres wskazany powyżej.

---

## I. Kim jesteśmy i czym jest ZR

ZR to platforma do rezerwacji usług fachowców/rzemieślników ("Mistrzów") świadczących usługi naprawcze i porządkowe w domu ("Usługi Mistrza") — wyszukiwanie dostępności w kalendarzu, rezerwacja terminu, komunikacja i opinie po wykonanej usłudze.

ZR **nie świadczy** samodzielnie Usług Mistrza — robi to niezależny Mistrz na podstawie odrębnej umowy zawieranej bezpośrednio z Klientem w momencie potwierdzenia rezerwacji. ZR jest operatorem platformy ułatwiającej zawarcie i realizację takiej umowy.

Rozliczenie za Usługę Mistrza odbywa się **poza platformą**, bezpośrednio między Klientem i Mistrzem — ZR nie przetwarza danych kart płatniczych ani nie pośredniczy w płatnościach.

## II. Kim jesteśmy jako administrator danych

1. ZR jest administratorem danych osobowych Mistrzów (osób fizycznych korzystających z Panelu Mistrza) w zakresie prowadzenia ich konta na platformie.
2. ZR jest administratorem danych osobowych Klientów w zakresie, w jakim dane te są przetwarzane w związku z korzystaniem z platformy (konto, historia rezerwacji, opinie, komunikacja).
3. W zakresie, w jakim Mistrz wykorzystuje udostępnione mu przez ZR dane Klienta wyłącznie do wykonania zamówionej Usługi Mistrza (np. kontakt telefoniczny w celu dojazdu), Mistrz staje się odrębnym, samodzielnym administratorem tych danych i odpowiada za zgodność tego przetwarzania z RODO na zasadach ogólnych — ZR nie odpowiada za sposób przetwarzania danych Klienta przez Mistrza poza platformą.
4. ZR nie przetwarza w tym momencie danych osobowych jako podmiot przetwarzający (processor) na zlecenie Mistrzów — model ten może zostać wprowadzony w przyszłości wraz z rozwojem funkcji platformy (np. narzędzia marketingowe Mistrza), o czym Mistrzowie zostaną poinformowani odrębnie wraz z aktualizacją niniejszej Polityki.

## III. Jakie dane przetwarzamy i w jakim celu

### A. Dane Klientów

| Kategoria danych | Przykłady | Cel | Podstawa prawna (RODO) |
|---|---|---|---|
| Dane identyfikacyjne i kontaktowe | imię, numer telefonu, adres e-mail (opcjonalnie) | założenie/obsługa rezerwacji, kontakt w sprawie zamówienia | art. 6(1)(b) — wykonanie umowy/działania przed jej zawarciem |
| Dane dot. zamówienia | opis potrzebnej usługi, adres realizacji usługi, wybrany termin | umożliwienie rezerwacji i dojazdu Mistrza | art. 6(1)(b) |
| Nagranie głosu (opcjonalnie) | krótkie nagranie, gdy Klient używa przycisku mikrofonu | zamiana mowy na tekst w polu formularza; nagranie nie jest przechowywane ani zapisywane w logach, tekst trafia tylko do pola, które Klient sam wysyła | art. 6(1)(b) |
| Treść opinii | ocena, komentarz tekstowy, do 3 zdjęć | budowanie zaufania na platformie, wyświetlanie opinii publicznie | art. 6(1)(f) — uzasadniony interes ZR i innych użytkowników w wiarygodności opinii |
| Dane komunikacyjne | treść SMS z linkiem do opinii, powiadomienia | obsługa procesu rezerwacji/opinii | art. 6(1)(b) |
| Dane techniczne | adres IP, identyfikator urządzenia, preferencje językowe | działanie i bezpieczeństwo platformy | art. 6(1)(f) |

### B. Dane Mistrzów

| Kategoria danych | Przykłady | Cel | Podstawa prawna (RODO) |
|---|---|---|---|
| Dane identyfikacyjne i kontaktowe | imię, numer telefonu, login, hash hasła | prowadzenie konta/Panelu Mistrza | art. 6(1)(b) |
| Dane o usługach i cenach | lista usług, ceny, czas realizacji | prezentacja oferty Mistrza Klientom | art. 6(1)(b)/(f) |
| Dane lokalizacyjne | lokalizacja urządzenia — tylko gdy Panel Mistrza jest aktywny (foreground) lub, w aplikacji mobilnej, w tle **po odrębnej zgodzie (opt-in)** | wyświetlanie Klientom orientacyjnej pozycji/dojazdu Mistrza | art. 6(1)(a) — zgoda (lokalizacja w tle) / art. 6(1)(b) (lokalizacja foreground, niezbędna do funkcji "jestem w drodze") |
| Identyfikator Telegram (chat_id) | powiązany przez jednorazowy link, nigdy wpisywany ręcznie | wysyłka powiadomień o nowych rezerwacjach | art. 6(1)(b) |
| Token powiadomień push (FCM) | identyfikator urządzenia mobilnego | wysyłka powiadomień push | art. 6(1)(b) |
| Dane analityczne | statystyki rezerwacji, ocena, liczba opinii | panel analityczny dla Mistrza i admina platformy | art. 6(1)(f) |

### C. Dane techniczne (wszyscy użytkownicy) — patrz też Polityka cookies (sekcja V)

Adres IP, typ urządzenia/przeglądarki, dane sesji logowania (np. token sesji), preferencje językowe (pl/ru/uk/en), dane o sposobie korzystania z platformy w celu zapewnienia bezpieczeństwa i poprawnego działania usługi — art. 6(1)(f).

## IV. Komu udostępniamy dane (odbiorcy / podwykonawcy)

Dane mogą być przekazywane podmiotom wspierającym nas w świadczeniu usługi, działającym na nasze zlecenie na podstawie umów powierzenia przetwarzania danych (art. 28 RODO) lub — w przypadku usług publicznych — na zasadach ich regulaminów. Poniżej wskazujemy konkretnych dostawców.

| Odbiorca | Cel | Jakie dane | Lokalizacja / transfer |
|---|---|---|---|
| **Render** (Render Services, Inc.) | hosting aplikacji i strony internetowej | wszystkie dane przechodzące przez aplikację; dzienniki serwera (IP, czas, adres żądania) | USA (spółka); region serwerów: **[do uzupełnienia]** |
| **Neon** (Neon, Inc.) | baza danych PostgreSQL | cała baza: zlecenia, dane Klientów i Mistrzów, opinie | centrum danych AWS we Frankfurcie (UE, eu-central-1); spółka z USA |
| **OpenAI** (OpenAI, USA) | (a) tworzenie treści powiadomień; (b) rozpoznawanie mowy; (c) dopasowanie usług do opisu zadania | (a) imię i telefon Klienta, nazwa usługi, termin, miasto, ew. słowa Klienta o problemie; (b) nagranie głosu — wyłącznie do zamiany na tekst; (c) tekst opisu zadania. Nagrania, rozpoznanego tekstu ani opisu zadania nie przechowujemy | USA — **transfer poza EOG** |
| **Google Firebase Cloud Messaging** (Google) | powiadomienia push w aplikacji mobilnej | token urządzenia, tytuł i treść powiadomienia | USA / globalnie — **transfer poza EOG** |
| **Telegram** | powiadomienia dla Mistrza (dobrowolne, wymagają połączenia konta przez Mistrza) | identyfikator czatu Mistrza, treść powiadomienia | globalnie — **transfer poza EOG** |
| **Twilio** (Twilio Inc.) lub inna polska bramka SMS **[wybór dostawcy: do ustalenia]** | SMS do Klientów (potwierdzenie, link do opinii) — **funkcja obecnie wyłączona** | numer telefonu Klienta, treść SMS | USA (Twilio) — **transfer poza EOG**; dotyczy dopiero po uruchomieniu SMS |
| **Photon** (komoot GmbH) i **Nominatim** (OpenStreetMap Foundation) | zamiana adresu wpisanego przez Klienta na współrzędne, by pokazać odległość do Mistrza | wpisany adres; adres IP serwera ZR (nie Klienta). Adresu nie przechowujemy | Niemcy / Wielka Brytania |
| **OpenStreetMap** (kafelki mapy) | wyświetlenie mapy z pozycją Mistrza | adres IP i oglądany obszar mapy w przeglądarce Klienta | Wielka Brytania i serwery OSM |
| **zlecai** (odrębny projekt tego samego właściciela, dyspozytor zleceń) | wskazywanie Mistrzów ZR osobom szukającym fachowca | aktywni Mistrzowie: imię, numer telefonu (jeśli został wpisany do karty Mistrza), ocena, liczba opinii, orientacyjna lokalizacja (jeśli włączona), link do rezerwacji | zob. umowa / zgoda Mistrza **[do uzupełnienia]** |
| Apple App Store / Google Play | dystrybucja aplikacji mobilnej (po publikacji) | dane instalacji wg regulaminów sklepów | zależnie od sklepu |
| Organy publiczne | wyłącznie gdy wymaga tego obowiązujące prawo | zakres wskazany w żądaniu | PL |

Treści powiadomień generuje model językowy dostawcy wskazanego powyżej (obecnie OpenAI; konfiguracja pozwala przełączyć na innego dostawcę — wówczas zaktualizujemy tę listę). Do modelu trafiają wyłącznie fakty potrzebne do treści wiadomości.

ZR nie sprzedaje danych osobowych i nie udostępnia ich podmiotom trzecim do ich własnych celów marketingowych.

> Do weryfikacji przed publikacją: (1) region serwerów Render; (2) dla każdego dostawcy spoza EOG (OpenAI, Google, Telegram, Twilio, Render, Neon) — podstawa transferu: decyzja Komisji Europejskiej o adekwatności (np. certyfikat EU-US Data Privacy Framework danego dostawcy — sprawdzić aktualny status), standardowe klauzule umowne (SCC) lub inna; (3) zawarcie lub zaakceptowanie umów powierzenia (DPA) z podmiotami przetwarzającymi; (4) podstawa i zgoda Mistrzów na przekazywanie danych do zlecai.

## V. Polityka cookies

Patrz odrębny dokument: **Polityka cookies ZR** (plik `cookie-policy.pl.md`), zawierający pełny opis kategorii plików cookie, celów ich użycia i sposobu zarządzania zgodą. Niniejsza Polityka Prywatności odnosi się do tego dokumentu w zakresie, w jakim dane zbierane za pośrednictwem cookies stanowią dane osobowe.

## VI. Okres przechowywania danych

- Dane konta Klienta/Mistrza — przez czas posiadania aktywnego konta, a po jego usunięciu przez okres niezbędny do obrony przed roszczeniami (standardowo 3 lata — podstawowy termin przedawnienia roszczeń, do weryfikacji z prawnikiem w zależności od rodzaju roszczenia).
- Treść rezerwacji i komunikacji z nią związanej — przez okres niezbędny do rozliczenia usługi i rozpatrzenia ewentualnych reklamacji, a następnie zgodnie z terminami przedawnienia roszczeń.
- Opinie — przez czas funkcjonowania konta Mistrza, którego dotyczą, chyba że Klient zażąda wcześniejszego usunięcia (patrz prawa w sekcji VII) i nie zachodzi przesłanka nadrzędnego interesu w ich zachowaniu (np. ochrona przed nieuzasadnionym usuwaniem negatywnych opinii).
- Dane techniczne/logi — maksymalnie [●] miesięcy *(do ustalenia — typowo 6–12 miesięcy)*.
- Dane niezbędne do rozliczeń podatkowych — po rejestracji spółki, 5 lat zgodnie z przepisami podatkowymi.

## VII. Twoje prawa

W związku z przetwarzaniem danych osobowych przysługuje Ci prawo do:

- dostępu do swoich danych i uzyskania ich kopii,
- sprostowania (poprawienia) danych,
- usunięcia danych ("prawo do bycia zapomnianym"), w zakresie przewidzianym prawem,
- ograniczenia przetwarzania,
- przenoszenia danych,
- wniesienia sprzeciwu wobec przetwarzania opartego na art. 6(1)(f) (uzasadniony interes),
- wycofania zgody w każdym czasie — bez wpływu na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem (tam, gdzie podstawą jest zgoda, np. lokalizacja w tle, marketing, niektóre cookies),
- wniesienia skargi do organu nadzorczego — **Prezesa Urzędu Ochrony Danych Osobowych** (ul. Stawki 2, 00-193 Warszawa).

Aby skorzystać z powyższych praw, napisz na adres kontaktowy wskazany na początku niniejszej Polityki.

## VIII. Dobrowolność podania danych

Podanie danych niezbędnych do rezerwacji usługi (np. telefon, adres realizacji) jest dobrowolne, ale niezbędne do zawarcia i wykonania umowy — bez nich rezerwacja nie będzie możliwa. Podanie zgody na lokalizację w tle, komunikację marketingową lub niektóre cookies jest w pełni dobrowolne i nie wpływa na możliwość korzystania z podstawowych funkcji platformy.

## IX. Zmiany Polityki Prywatności

Niniejsza Polityka może być aktualizowana, w szczególności w związku z rozwojem funkcji platformy, zmianą dostawców lub zmianami w przepisach. O istotnych zmianach poinformujemy użytkowników w sposób zwyczajowo przyjęty (np. komunikat w aplikacji/na stronie).

Ostatnia aktualizacja: [●].
