# ZR („Złota Rączka" / „Мастер на час") — informacje dla prawnika

> Dokument roboczy na konsultację z prawnikiem (umowy z Mistrzami, regulamin, polityka prywatności i wszystko, co będzie potrzebne przy starcie). Sporządzony według faktycznego stanu produktu na dzień **21.11.2026**, na podstawie kodu i dokumentów projektu. **To opis faktów, a nie ocena prawna.** Tam, gdzie fakt jest nieznany lub decyzja jeszcze nie zapadła, stoi adnotacja **[do ustalenia]** lub **[decyzja niepodjęta]**. Pytania do prawnika zebrano w rozdziale 10.
>
> To nie dotyczy wyłącznie RODO: jest tu także konstrukcja umowna, odpowiedzialność, ochrona konsumentów, opinie, funkcje algorytmiczne i AI oraz licencje na treści Mistrzów.

---

## 1. Czym jest produkt

**Platforma rezerwacji usług „złotej rączki na godziny"**: Klient wybiera Mistrza w swoim mieście, widzi jego wolne terminy w kalendarzu i rezerwuje. Mistrz otrzymuje zlecenie, potwierdza je (zawsze ręcznie), dojeżdża do Klienta i wykonuje pracę. To **nie jest marketplace leadów** (jak Fixly.pl): Klient rezerwuje konkretny termin, a nie zostawia zapytania rozsyłanego do wielu wykonawców.

- Obecnie **dwóch Mistrzów**, region Trójmiasto (Gdynia, Sopot, Gdańsk). Konta Mistrzów zakłada wyłącznie superadministrator, bez publicznej samodzielnej rejestracji.
- Kanały: strona internetowa (responsywna) i aplikacja mobilna (Android gotowy, iOS czeka na konto Apple Developer). Aplikacja jest jedna dla Klienta i Mistrza i stanowi nakładkę na działającą stronę.
- Języki interfejsu: polski, angielski (rosyjski i ukraiński — dla nazw usług).
- Operator: **[spółka w trakcie rejestracji — z o.o.? do ustalenia: nazwa, adres w Gdyni, NIP, KRS]**. Na razie wszystko prowadzi osoba fizyczna — założyciel. We wszystkich projektach dokumentów dane Operatora to znaczniki zastępcze.
- Odrębny produkt tego samego właściciela, **zlecai** (dyspozytor AI zleceń), otrzymuje od nas listę Mistrzów z numerami telefonów (pkt 5.6).
- **Platforma nie przyjmuje ani nie przekazuje pieniędzy**: nie ma płatności za usługi, prowizji ani abonamentu Mistrzów (na razie). Mistrz otrzymuje zapłatę od Klienta bezpośrednio. Platforma przechowuje wyłącznie „cenę końcową pracy", którą Mistrz sam wpisuje po zakończeniu (na potrzeby jego statystyk).

## 2. Strony i role

| Rola | Kto | Jak trafia na platformę |
|---|---|---|
| **Operator (ZR)** | spółka w rejestracji | jest właścicielem i prowadzi platformę |
| **Mistrz** | niezależny wykonawca, prawdopodobnie jednoosobowa działalność gospodarcza lub spółka **[do ustalenia dla każdego z dwóch Mistrzów]** | konto zakłada superadministrator ręcznie: e-mail + hasło, następnie Mistrz sam zmienia hasło |
| **Pracownik Mistrza** | osoba dodana przez Mistrza do jego panelu | Mistrz zakłada jej dostęp i nadaje uprawnienia polami wyboru (role: właściciel, menedżer, pracownik; uprawnienia: kalendarz, usługi, godziny, ustawienia, statystyki itd.) |
| **Klient** | osoba fizyczna (konsument), bez konta | rezerwuje jako gość: imię i telefon |
| **Superadministrator** | właściciel platformy | logowanie tajnym hasłem; widzi wszystkich Mistrzów, opinie, statystyki |

Według projektu regulaminu: Operator **nie jest stroną umowy o świadczenie usługi** między Klientem a Mistrzem i nie świadczy usług, lecz udostępnia narzędzie (kalendarz, rezerwacja, komunikacja, system opinii). Umowę o usługę zawierają Klient i Mistrz. Zob. `regulamin.pl.md` §2.

## 3. Jak to działa — droga zlecenia

1. **Klient** otwiera stronę lub aplikację. Wybiera miasto (ze słownika miast prowadzonego przez superadministratora) — wybór zapamiętuje się na urządzeniu. Widzi tylko Mistrzów z tego miasta.
2. **Wyszukiwanie Mistrza.** Pole „Co trzeba zrobić?" przyjmuje opis zadania własnymi słowami (tekstem lub głosem). Model AI wybiera spośród usług, które aktualnie oferują Mistrzowie w mieście, do trzech pasujących; na ekranie zostają odpowiedni Mistrzowie. Model wybiera tylko z gotowej listy usług i nie może wymyślić własnej. Alternatywa — wybór Mistrza lub usługi ręcznie. Sortowanie Mistrzów — według oceny (zob. pkt 7); nie ma płatnego wyróżniania ani reklam.
3. **Terminy.** Klient wybiera usługę, dzień i godzinę spośród wolnych terminów Mistrza (godziny pracy Mistrza minus zajęte zlecenia minus blokady, strefa czasowa Europe/Warsaw). Termin bliższy niż „15 minut + czas dojazdu Mistrza" nie jest pokazywany.
4. **Zlecenie.** Klient podaje imię, telefon (format jest walidowany; zapis w formacie E.164), może dodać opis pracy i polem wyboru zdecydować, czy Mistrz widzi jego numer. Zlecenie powstaje ze statusem **„oczekuje"** (`pending`).
5. **Potwierdzenie przez Mistrza — zawsze ręczne.** Mistrz otrzymuje powiadomienie (push, Telegram, opcjonalnie Web Push). Timer: przypomnienia w 5. i 10. minucie, w 15. minucie — **automatyczne anulowanie**, Klient dostaje wiadomość. Zlecenia poza godzinami pracy Mistrza czekają do początku dnia pracy (w nocy nie budzimy). Przy potwierdzeniu Mistrz **obowiązkowo** podaje czas dojazdu (15/30/45/60/90 minut) — trafia on do Klienta; platforma zestawia go z kalendarzem Mistrza i ostrzega, jeśli po poprzedniej pracy Mistrz nie zdąży.
6. **Klient może sam** anulować lub przełożyć zlecenie, dopóki do rozpoczęcia zostaje więcej czasu, niż ustawił Mistrz (ustawienie Mistrza: do rozpoczęcia / 30 / 60 / 90 / 120 / 180 min, domyślnie 120). Później — tylko kontakt z Mistrzem.
7. **Mistrz** może przełożyć zlecenie (Klient dostaje powiadomienie), anulować, oznaczyć „wykonane" lub „nie przyszedł" (dwa ostatnie — dopiero od momentu rozpoczęcia zlecenia). Może też sam wpisać zlecenie do kalendarza (od razu `confirmed`, bez timera).
8. **Po „wykonane"** Klient dostaje link (SMS-em lub na stronie zlecenia): najpierw „czy praca została wykonana?" — „tak, potwierdzam" albo „jest problem" + tekst. O problemie natychmiast dowiaduje się Mistrz/właściciel. Następnie Klient może wystawić ocenę i napisać opinię ze zdjęciami.
9. **Mapa i „gdzie mój Mistrz".** Jeśli Mistrz włączył udostępnianie lokalizacji, Klient mający zlecenie na dziś widzi punkt Mistrza na mapie i przewidywaną godzinę przyjazdu. Dokładny punkt Mistrza **nie jest publicznie ujawniany**: lista pokazuje tylko zaokrągloną odległość od Klienta (jeśli Klient sam podał swój punkt).
10. **Nie ma kar, przedpłat, kaucji, prowizji ani sankcji za nieobecność i anulowanie.** Status „nie przyszedł" jest tylko rejestrowany (na potrzeby statystyk).

## 4. Jakie dane zbiera platforma

### 4.1. Klient (nie ma konta; dane są powiązane ze zleceniem)

| Dane | Skąd | Po co | Gdzie przechowywane | Kto widzi |
|---|---|---|---|---|
| Imię | formularz zlecenia | realizacja zlecenia | baza (rekord zlecenia) | Mistrz zlecenia, superadministrator |
| Telefon (E.164) | formularz zlecenia | kontakt, SMS, wyszukiwanie zleceń Klienta | baza (zlecenie) | Mistrz — tylko jeśli Klient zaznaczył zgodę; superadministrator widzi tylko ostatnie 4 cyfry na liście opinii |
| Opis pracy (tekst, do 1000 znaków) | formularz zlecenia (tekstem lub głosem) | aby Mistrz zrozumiał zadanie | baza (`booking.notes`) | Mistrz |
| Termin, usługa, miasto, status zlecenia, czas dojazdu | zlecenie | realizacja, statystyki | baza | Mistrz, superadministrator (zbiorczo) |
| Potwierdzenie wykonania / tekst o problemie | strona zlecenia / link | kontrola jakości | baza | Mistrz, właściciel |
| Opinia: ocena, tekst, zdjęcia (do 3), imię | formularz opinii | ocena Mistrzów | baza (zdjęcia — jako data-URL bezpośrednio w tabeli) | publicznie: imię w formie „Jan K.", tekst, zdjęcia; superadministrator widzi więcej |
| Token-link „moje zlecenie" (`manage_token`) | generowany | dostęp Klienta bez konta | baza; w linku SMS/aplikacji | posiadacz linku |
| Token push (FCM) urządzenia | aplikacja przy zleceniu | powiadomienia o zleceniu | baza (`device_push_token`, powiązany z numerem telefonu Klienta) | system |
| Współrzędne Klienta | przycisk „według mojej lokalizacji" lub wpisany adres | miasto i odległość do Mistrza | **na serwerze nie są przechowywane**; punkt jest zaokrąglany do ok. 100 m i leży tylko w localStorage urządzenia; z dziennika dostępu współrzędne są wycinane | nikt |
| Adres wpisany ręcznie | formularz wyszukiwania | odległość do Mistrza | na serwerze nie jest przechowywany (w treści żądania, do dziennika nie trafia); trafia do zewnętrznego geokodera (pkt 5) | — |
| Nagranie głosu | mikrofon (po naciśnięciu) | dyktowanie zamiast pisania | **nie jest przechowywane ani u nas, ani w logach**; trafia do rozpoznawania mowy w OpenAI (pkt 5) | — |
| Dane na urządzeniu (localStorage) | strona/aplikacja | miasto, „moje zlecenia" (w aplikacji — z imieniem, telefonem i historią), pozycja | urządzenie Klienta | Klient |

Klient **nie zakłada konta, nie ustawia hasła, nie wyraża zgody na marketing**. Nie ma wysyłek reklamowych.

Czego **nie** zbieramy: adresu wykonania zlecenia jako osobnego pola (Klient może go wpisać w opisie lub podać Mistrzowi telefonicznie), e-maila Klienta, daty urodzenia, dokumentów, danych płatniczych.

### 4.2. Mistrz i pracownicy

| Dane | Skąd | Po co | Uwaga |
|---|---|---|---|
| E-mail, skrót (hash) hasła | zakłada superadministrator | logowanie | hasło jest przechowywane wyłącznie w postaci skrótu |
| Imię, telefon | superadministrator / Mistrz | profil, kontakt | telefon Mistrza Klient widzi według ustawienia Mistrza: zawsze / po zleceniu / po potwierdzeniu (domyślnie — po potwierdzeniu); dyspozytor zlecai — zawsze (pkt 5.6) |
| Zdjęcie profilowe (kwadrat 256 px) i „O mnie" (do 600 znaków) | Mistrz | profil | publicznie |
| Usługi, ceny (od/do), czas wykonania, opłata za dojazd | Mistrz | katalog | publicznie |
| Godziny pracy, wyjątki, blokady | Mistrz | kalendarz | nie publicznie (określają terminy) |
| Miasta pracy | Mistrz | wyniki według miast | publicznie |
| **Lokalizacja w czasie rzeczywistym** | telefon Mistrza, jeśli włączono „pokazuj lokalizację" | pokazanie Klientowi, gdzie jest Mistrz, i liczenie odległości | przechowywany jest **tylko ostatni punkt** z czasem (nie ma historii przemieszczeń); udostępniany Klientowi tylko w oknie zlecenia; pobieranie współrzędnych w tle — przez systemowe uprawnienie „Zawsze"; mechanizm nadzorczy może „obudzić" aplikację cichym pushem |
| Telegram `chat_id` | Mistrz sam łączy bota | powiadomienia | łączenie linkiem-tokenem; link wydaje superadministrator |
| Tokeny push / subskrypcje Web Push | aplikacja | powiadomienia | po jednym wierszu na urządzenie, rola Mistrza i/lub Klienta |
| Rola i uprawnienia pracownika | Mistrz | zarządzanie dostępem | |
| Zlecenia, ceny, ceny końcowe, statystyki | praca w systemie | panel Mistrza | Mistrz widzi swoje; superadministrator — wszystkie |
| Ocena, opinie o nim | Klienci | ocena | zob. pkt 7 |
| **Zgoda na regulamin** (`master_user.terms_accepted_at`) | Mistrz przy wejściu do panelu | dowód akceptacji warunków | ekran z polem wyboru przy pierwszym logowaniu; obecni Mistrzowie zobaczą go przy najbliższym logowaniu |
| **Prywatne notatki i czarna lista o Klientach** (telefon Klienta, notatka, powód, komentarz) | Mistrz | własna kartoteka, ostrzeżenie o nowym zamówieniu | widoczne tylko dla tego Mistrza, platforma i inni Mistrzowie ich nie widzą; zamówienie nie jest blokowane. Zob. pytanie 36 |

### 4.3. Dane techniczne i cookies

- **Cookies/tokeny:** cookie sesyjne i token Bearer do logowania Mistrza i superadministratora (token Mistrza — 30 dni, odnawiany przy uruchomieniu). Dla Klienta cookie logowania nie ma. Język i miasto — w localStorage. Service worker buforuje strony na potrzeby działania aplikacji.
- **Zewnętrznych narzędzi analitycznych/marketingowych i pikseli reklamowych w kodzie nie ma** (sprawdzone wyszukiwaniem w kodzie po popularnych nazwach; ostateczne potwierdzenie warto wykonać przy przeglądzie zależności). Opisane w projekcie `cookie-policy.*`.
- **Dzienniki serwera** (hosting): IP, czas, URL żądania; współrzędne Klienta są wycinane z dziennika; okres przechowywania **[zależy od ustawień hostingu — do ustalenia]**.
- **Limity żądań** według IP są przechowywane w pamięci procesu.

## 5. Strony trzecie: kto otrzymuje dane

| Odbiorca | Rola | Jakie dane | Gdzie | Status |
|---|---|---|---|---|
| **Render** (hosting API i strony) | podmiot przetwarzający | wszystko, co przechodzi przez API; dzienniki | **region [do ustalenia]**; spółka z USA | produkcja |
| **Neon** (PostgreSQL) | podmiot przetwarzający | cała baza | AWS **eu-central-1** (Frankfurt) | produkcja |
| **OpenAI** | podmiot przetwarzający (USA) | (a) audio przy głosowym wprowadzaniu; (b) tekst opisu zadania przy wyszukiwaniu; (c) fakty do treści powiadomień: imię Klienta, telefon Klienta, usługa, czas, miasto, słowa Klienta o problemie | USA | produkcja; dostawcę można przełączyć na Anthropic ustawieniem |
| **Google Firebase (FCM)** | podmiot przetwarzający | tokeny push i treść powiadomień (tytuł, tekst) | USA/globalnie | produkcja |
| **Telegram** | podmiot przetwarzający / odrębny administrator | `chat_id` Mistrza i treść powiadomienia dla Mistrza | globalnie | produkcja, na życzenie Mistrza |
| **Twilio** (SMS do Klientów) | podmiot przetwarzający | numer telefonu i treść SMS | USA | **kod gotowy, SMS wyłączone** (wersja trial nie wystarcza; polska bramka lub płatny Twilio — **[decyzja niepodjęta]**) |
| **Photon (komoot)** i **Nominatim (OSM)** | odbiorcy | adres wpisany przez Klienta do liczenia odległości; IP serwera | Niemcy / Wielka Brytania | produkcja |
| **OpenStreetMap** (kafelki mapy) | odbiorca | IP i oglądany obszar w przeglądarce Klienta | | mapa Mistrza |
| Przeglądarkowe usługi push (Web Push) | odbiorcy | zaszyfrowany push | | u Mistrzów |
| **Apple / Google Play / Codemagic** | dystrybucja aplikacji | zależy od publikacji | | iOS i Play jeszcze nieopublikowane |
| **zlecai** (projekt tego samego właściciela) | odbiorca | lista aktywnych Mistrzów: imię, telefon, ocena, liczba opinii, współrzędne | zob. pkt 5.6 | produkcja |

**Treści powiadomień pisze model AI**, w kodzie nie ma gotowych tekstów: kod przekazuje cel wiadomości i fakty. Wartości faktów są wyraźnie oznaczone jako dane, nie jako polecenia.

### 5.6. Przekazywanie danych Mistrzów do zlecai

`GET /api/dispatcher/masters` zwraca (po kluczu `Authorization: Bearer`) aktywnych Mistrzów: imię, telefon, ocenę, liczbę opinii, współrzędne (jeśli włączono lokalizację), link do rezerwacji. Telefon trafia tam tylko wtedy, gdy superadministrator wpisał go do karty Mistrza. To **przekazywanie danych Mistrzów drugiemu produktowi właściciela**: trzeba ustalić, kto jest w tym przepływie administratorem, i uzyskać zgodę Mistrzów.

## 6. Bezpieczeństwo (w skrócie)

- Hasła Mistrzów — wyłącznie skróty. Tokeny sesji są podpisane. Dostęp superadministratora — tajne hasło z limitem prób.
- Role i uprawnienia pracowników Mistrza są sprawdzane po stronie serwera. Mistrz widzi tylko swoje zlecenia i dane.
- Baza — zarządzany PostgreSQL (Neon, szyfrowane połączenie). Podwójna rezerwacja jest wykluczona na poziomie bazy.
- Limity żądań na publicznych punktach końcowych (rezerwacja, opinie, głos, wyszukiwanie zadań, geokoder).
- **Czego nie ma [do ustalenia, czy potrzebne]:** rejestru dostępu do danych osobowych według użytkowników, regularnych testów penetracyjnych, udokumentowanego planu reagowania na incydenty, szyfrowania pojedynczych kolumn (telefony są w bazie przechowywane jawnym tekstem).

## 7. Opinie i ocena

- Opinię można wystawić **tylko do zakończonego zlecenia** (Mistrz musi oznaczyć „wykonane"), z jednorazowego linku, ważnego 14 dni; **jedna opinia na jedno zlecenie**.
- Ocena 1–5, tekst, do 3 zdjęć. Autor jest publicznie wyświetlany jako „Jan K.".
- Ocena Mistrza jest przeliczana z opinii. **Publicznie ocena jest pokazywana dopiero od 3 opinii** (wcześniej — „nowy Mistrz").
- **Środki przeciw nakręcaniu** (wprowadzone 21.11.2026): zlecenia wpisane przez samego Mistrza w kalendarzu nie otrzymują zaproszenia do opinii; superadministrator widzi opinie z podpowiedziami (jeden numer wystawił Mistrzowi kilka opinii, opinia przyszła mniej niż godzinę po utworzeniu zlecenia, numer Klienta pokrywa się z numerem samego Mistrza) i może **ukryć opinię** (znika z publicznej listy i z oceny). Mistrz nie może usuwać opinii.
- **Słabe miejsce:** telefon Klienta nie jest weryfikowany (SMS wyłączone), więc znajomy może utworzyć zlecenie z cudzym numerem, a Mistrz je zamknie. Weryfikacja numeru SMS-em pojawi się razem z SMS.
- Ocena określa kolejność Mistrzów na liście; płatnego promowania nie ma.

## 8. Funkcje zautomatyzowane i AI

1. **Treści powiadomień** pisze LLM (OpenAI, `gpt-4o-mini`); wykorzystywane są w nich imię i telefon Klienta.
2. **Wyszukiwanie Mistrza po zadaniu**: LLM wybiera do 3 usług z katalogu; decyzja nie wpływa ani na cenę, ani na dostępność, a jedynie na to, których Mistrzów pokazać w pierwszej kolejności. Można ją ominąć, wybierając Mistrza lub usługę ręcznie.
3. **Wprowadzanie głosowe**: rozpoznawanie mowy w OpenAI; tekst sam się nie wysyła, człowiek go sprawdza.
4. **Automatyczne anulowanie** zlecenia po upływie timera (15 minut bez potwierdzenia przez Mistrza) — automatyczne, ale według przejrzystej reguły.
5. **Weryfikacja numeru i ograniczenia** — algorytmiczne limity żądań.

Dźwięk, rozpoznany tekst i tekst zadania **nie są przechowywane ani zapisywane w dzienniku**.

## 9. Co już przygotowano (projekty)

Pliki w `docs/legal/` (wersja polska — wiążąca, rosyjska i angielska — tłumaczenia robocze):

- `regulamin.pl.md`, `terms.ru.md`, `terms.en.md` — regulamin platformy;
- `polityka-prywatnosci.pl.md`, `privacy-policy.ru.md`, `privacy-policy.en.md` — polityka prywatności;
- `cookie-policy.pl.md` / `.ru.md` / `.en.md` — cookies;
- `dsa-memo.pl.md` / `.en.md` — notatka o DSA (ocena: mikroprzedsiębiorstwo, pełny zakres niepotrzebny; potrzebny kanał zgłaszania bezprawnych opinii).

**Do zestawienia z obecnym produktem** (co pojawiło się po napisaniu projektów): wyszukiwanie Mistrza po zadaniu (tekst trafia do OpenAI), treści powiadomień od LLM z imieniem i telefonem Klienta, lokalizacja Mistrza w tle na Androidzie z „budzeniem" pushem, pokazywanie punktu Mistrza Klientowi, pole zgody na widoczność telefonu Klienta i ustawienie widoczności telefonu Mistrza, ochrona oceny (ukrywanie opinii, próg 3 opinii), telefon Mistrza u zlecai, timer automatycznego anulowania, zasady anulowania/przekładania przez Klienta, potwierdzanie wykonania przez Klienta, pracownicy Mistrza i ich uprawnienia, to że SMS na razie nie działają, a strona je obiecuje (blok „Masz już zamówienie?" i podpowiedź przy polu telefonu).

**Stan na 27.11.2026:** na stronie są podstrony regulaminu i polityki (po polsku i angielsku, z oznaczeniem „wersja robocza”), w formularzu zamówienia obowiązkowe pole zgody (czas zapisywany w zamówieniu), Mistrz akceptuje warunki przy wejściu do panelu. Projekty regulaminu i polityki uzupełniono o: ręczne potwierdzanie i automatyczne anulowanie po 15 minutach, wyszukiwanie po zadaniu i głos, potwierdzenie wykonania przez Klienta, ochronę ocen (ukrywanie opinii, próg 3 opinii, zakaz manipulacji), kartę klienta i czarną listę, dane na urządzeniu Klienta.

## 10. Pytania do prawnika

**A. Umowa z Mistrzem (najpilniejsze)**
1. Jaka konstrukcja: umowa o świadczenie usług drogą elektroniczną / licencja na korzystanie z oprogramowania (SaaS) / agencyjna? Czy potrzebny jest regulamin dla Mistrzów jako odrębny dokument i jak jest akceptowany (pole wyboru przy pierwszym logowaniu, podpis)?
2. Co obowiązkowo uwzględnić: przedmiot, obowiązki Mistrza (rzetelność profilu, prowadzenie działalności, uprawnienia, ubezpieczenie OC, podatki i rachunki — wszystko po stronie Mistrza), zakaz fałszowania zleceń i opinii (w tym samemu sobie), zasady anulowania i nieobecności, odpowiedzialność za jakość, limit odpowiedzialności Operatora, rozwiązanie umowy, blokada konta, co dzieje się z opiniami i danymi po odejściu Mistrza.
3. **Wynagrodzenie Operatora**: na razie brak; planowany abonament czy prowizja? Od wyboru zależą umowa, VAT oraz (przy prowizji od zleceń) ewentualne uznanie platformy za pośrednika w płatnościach.
4. Wyłączność i „omijanie platformy" (Klient znalazł Mistrza i dalej umawia się bezpośrednio): czy dopuszczalne są zakazy i kary umowne?
5. Licencja na zdjęcia, opisy i treści Mistrza (publiczne wyświetlanie, także w zlecai i w reklamie).
6. Mistrzowie jako **konsumenci lub przedsiębiorcy**: czy obejmuje ich ochrona konsumencka (nie, jeśli są przedsiębiorcami — potwierdzić).
7. Forma prawna Mistrzów na starcie: jeśli Mistrz jest osobą fizyczną bez działalności, zmienia to wszystko; jak weryfikować status przy zakładaniu konta?

**B. Rola platformy i odpowiedzialność wobec Klienta**
8. Czy wystarcza sformułowanie „Operator nie jest stroną umowy" (`regulamin` §2), jeśli platforma **dobiera i szereguje** Mistrzów, pokazuje ceny, ustawia timer potwierdzenia i sama rozsyła powiadomienia? Ryzyko uznania Operatora za stronę lub współodpowiedzialnego.
9. Kiedy **zawierana jest umowa między Klientem a Mistrzem**: przy utworzeniu zlecenia czy przy potwierdzeniu przez Mistrza? Co widzi Klient na ekranie „zlecenie utworzone" (obecnie status „oczekuje", automatyczne anulowanie po 15 minutach)?
10. **Obowiązki informacyjne przy sprzedaży usług konsumentom na odległość** (identyfikacja Mistrza-przedsiębiorcy, cena, tryb reklamacji, prawo odstąpienia w 14 dni i jego wyłączenie dla usług wykonywanych na żądanie Klienta w krótkim terminie). Czy obecne ekrany wystarczają?
11. **Cena**: Mistrz wpisuje „od/do" i opłatę za dojazd; cena końcowa jest wpisywana po wykonaniu; platforma ceny nie gwarantuje. Czy to wystarcza?
12. Prace niebezpieczne i regulowane (elektryka, gaz): Regulamin odwołuje się do kwalifikacji. Czy ograniczyć kategorie usług lub wymagać uprawnień (SEP) w profilu?
13. Ubezpieczenie i odpowiedzialność za szkody przy wykonywaniu prac; kto odpowiada w sporze.
14. Klienci **niepełnoletni** i wiek: obecnie brak weryfikacji.

**C. Dane (RODO/UODO) — podział ról**
15. **Role**: Operator — administrator danych platformy; Mistrz — samodzielny administrator danych własnych Klientów czy współadministrator? Czy potrzebna umowa między nimi?
16. Podstawy przetwarzania dla każdego celu: wykonanie umowy, prawnie uzasadniony interes (statystyki, ochrona przed nakręcaniem, bezpieczeństwo), zgoda (lokalizacja w tle, wiadomości Mistrza do Klienta?).
17. **Lokalizacja Mistrza w czasie rzeczywistym**: podstawa, zgoda Mistrza (forma i odwołanie), informowanie Klienta, minimalizacja (przechowywany tylko ostatni punkt), zwłaszcza tryb w tle „Zawsze" i „budzenie" pushem.
18. **Przekazywanie do państw trzecich**: OpenAI, Google Firebase, Telegram, Twilio, Render — SCC, DPF? Czy potrzebne umowy powierzenia (DPA) z każdym; co podpisuje się automatycznie w warunkach usług. Szczególnie treść powiadomień z imieniem i telefonem Klienta w OpenAI oraz wprowadzanie głosowe.
19. **Przekazywanie danych Mistrzów do zlecai** (pkt 5.6): podstawa, zgoda Mistrzów, kto jest administratorem, czy potrzebna umowa między dwoma produktami, jeśli podmiot prawny będzie jeden.
20. **Prawa osób w praktyce**: samoobsługi nie ma, wszystko ręcznie; usunięcie Mistrza jest zablokowane, dopóki ma on zlecenia (ograniczenie klucza obcego). Jak odpowiadać na żądanie usunięcia Klienta (anonimizacja zapisów zleceń: imię i telefon)? Okresy przechowywania (w projektach: 3 lata na roszczenia, 5 lat podatkowo) — potwierdzić. **Automatycznego usuwania po terminie nie ma.**
21. Polityka dla **opisu zadania i głosu**: czy potrzebna odrębna zgoda przed pierwszym użyciem mikrofonu i tekst informacyjny (obecnie — systemowe uprawnienie OS)?
22. Czy potrzebne: rejestr czynności przetwarzania (art. 30), ocena skutków DPIA (lokalizacja, profilowanie Mistrzów według oceny?), wyznaczenie IOD (raczej nie), procedura incydentów i zgłoszeń do UODO w 72 godziny.
23. **Dzienniki**: okres przechowywania logów hostingu, obecność IP w nich.
24. Przechowywanie **zdjęć opinii i Mistrzów** jako data-URL w bazie — kwestia minimalizacji i usuwania.

**D. Opinie i ocena**
25. Wymogi dotyczące opinii konsumenckich: czy trzeba publicznie opisać, jak weryfikowana jest ich autentyczność (opinie tylko do zakończonych zleceń, ale numer nie jest weryfikowany) i jak to sformułować, aby nie wprowadzać w błąd.
26. Prawo Mistrza do odpowiedzi na opinię i do jej zakwestionowania; prawo Operatora do ukrywania opinii (na jakiej podstawie, co napisać Mistrzowi i autorowi).
27. Próg 3 opinii przed pokazaniem oceny i sortowanie według oceny: czy wystarczająca jest przejrzystość parametrów szeregowania (jeden z obowiązków wynikających z Omnibus)?
28. Kanał zgłaszania bezprawnych opinii (DSA, pkt 3 `dsa-memo`).

**E. AI i automatyzacja**
29. Wymogi przejrzystości dla funkcji AI (treści powiadomień, wyszukiwanie po zadaniu, transkrypcja): czy potrzebne oznaczenie dla użytkownika, że tekst jest wygenerowany?
30. Automatyczne anulowanie zlecenia po timerze: czy wystarcza informowanie w regulaminie (decyzja automatyczna, ale nie „profilowanie o istotnych skutkach")?

**F. Komunikacja i SMS**
31. Jaki jest porządek SMS do Klientów (potwierdzenie zlecenia, link do opinii): czy to wiadomości serwisowe, czy potrzebna odrębna zgoda? Weryfikacja numeru kodem.
32. Strona obecnie obiecuje SMS, które nie są wysyłane (blok „Masz już zamówienie?", podpowiedź przy polu telefonu). Właściciel zdecydował na razie zostawić bez zmian: ocenić ryzyko wprowadzenia w błąd do czasu uruchomienia SMS.

**G. Rejestracja i podatki**
33. Forma (spółka), VAT, ewidencja przychodu przy abonamencie/prowizji, zobowiązania umowne wobec Mistrzów i Klientów do czasu rejestracji (obecnie wszystko prowadzi osoba fizyczna).
34. Nazwa i znak: znak towarowy, sprawdzenie nazwy **ZR / Złota Rączka** pod kątem kolizji.
35. Licencje oprogramowania open source w zależnościach (dane OSM wymagają wskazania źródła „© OpenStreetMap"; na formularzu odległości jest już ono umieszczone).
36. **Karta klienta i czarna lista u Mistrza**: prywatne zapisy Mistrza o Klientach są przechowywane u nas. Kto jest tu administratorem danych — Mistrz, a my tylko hostingiem (czy potrzebna umowa powierzenia, art. 28 RODO)? Czy dopuszczalne są powody „nie zapłacił / nie otworzył drzwi / niegrzeczny” i dowolny komentarz, jak informować Klienta (art. 14 RODO), okres przechowywania, prawo Klienta do dostępu i usunięcia.
37. **Zapis zgody**: czy wystarczy zaznaczenie pola z datą i godziną (bez wersji dokumentu i IP) dla regulaminu i polityki; czy potrzebna jest wersja tekstu; jak przyjmować zmiany regulaminu od obecnych Mistrzów.

## 11. Czego potrzeba od właściciela przed spotkaniem z prawnikiem

- Nazwa i dane spółki (gdy będą) oraz adres e-mail/telefon kontaktowy do żądań osób, których dane dotyczą.
- Planowany model przychodu od Mistrzów (abonament, prowizja, bezpłatnie) i data startu okresu płatnego.
- Status obu Mistrzów (forma, uprawnienia, OC) i czy są gotowi podpisać umowę.
- Region hostingu Render i okres przechowywania logów (do sprawdzenia w panelu).
- Decyzja w sprawie SMS: dostawca i termin uruchomienia.
- Decyzja w sprawie zlecai: czy to ten sam administrator danych i czy Mistrzowie są gotowi zgodzić się na przekazywanie telefonu.

## 12. Gdzie co leży w projekcie

- Opis produktu i decyzji: `CLAUDE.md`, `docs/decisions.md`, `docs/ai-and-reviews.md`, `README.md`.
- Schemat danych: `db/schema.sql`; modele: `app/models.py`.
- Powiadomienia i usługi zewnętrzne: `app/notifications.py`, `app/llm_text.py`, `app/speech.py`, `app/task_match.py`, `app/geocode.py`.
- Opinie i ochrona oceny: `app/main.py` (sekcja „Отзывы"), `app/admin_reviews.py`.
- Timer potwierdzenia: `app/confirm_timer.py`, `docs/confirm-timer-travel-cities-task.md`.
- Projekty dokumentów: `docs/legal/`.
