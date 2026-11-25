# ZR — model współpracy, zasady i ochrona przed nieuczciwymi stronami

> Propozycja do omówienia z prawnikiem, sporządzona według stanu na **23.11.2026**. To **nie jest stanowisko prawne**, lecz robocza koncepcja: co proponujemy zrobić, jakie niesie ryzyka i co trzeba rozstrzygnąć. Adnotacja **[decyzja właściciela]** oznacza, że wyboru jeszcze nie dokonano i odpowiedź jest potrzebna przed wysłaniem prawnikowi; **[do prawnika]** — pytanie, na które oczekujemy opinii. Fakty o produkcie pochodzą z kodu (rozdział 2), propozycje oznaczono słowem „proponujemy".
>
> Dokumenty powiązane: `lawyer-briefing.pl.docx` (opis produktu i danych), `regulamin.pl.docx` (projekt regulaminu).

---

## 1. Istota koncepcji w jednym akapicie

ZR to **narzędzie do rezerwacji**: Klient wybiera Mistrza i termin, Mistrz potwierdza i wykonuje pracę. **Umowę o usługę zawierają ze sobą Klient i Mistrz**, ZR nie jest jej stroną i **nie przyjmuje ani nie przekazuje pieniędzy za usługi**. Za korzystanie z platformy Mistrz płaci ZR odrębnie (obecnie — bezpłatnie). ZR odpowiada za działanie samej platformy, a nie za jakość prac ani za płatność Klienta. Dlatego ryzyka typu „nie zapłacił", „nie otworzył drzwi", „zrobił źle" leżą w pierwszej kolejności między Klientem a Mistrzem, a zadaniem ZR jest **dać stronom czytelne zasady, dowody (historia zlecenia, potwierdzenia) i narzędzia ochrony**, nie stając się gwarantem.

## 2. Co jest w produkcie dziś (fakty)

| Temat | Jak jest teraz | Uwaga |
|---|---|---|
| Płatność za usługę | poza platformą: gotówka, przelew, BLIK — jak się dogadają (regulamin §4.4) | platforma nie widzi, czy Klient zapłacił |
| Cena | Mistrz podaje „od/do" i opłatę za dojazd (informacyjnie); cenę końcową wpisuje po pracy | w sporze „ile ustalono" brak dowodów |
| Wynagrodzenie ZR | brak: ani prowizji, ani abonamentu | decyzja właściciela, zob. rozdz. 5 |
| Potwierdzenie zlecenia | zawsze ręcznie przez Mistrza; 15 minut, potem automatyczne anulowanie | |
| Anulowanie przez Klienta | sam, dopóki do rozpoczęcia zostaje więcej czasu, niż ustawił Mistrz (do rozpoczęcia / 30 / 60 / 90 / 120 / 180 min; domyślnie 120) | za późne anulowanie nie ma konsekwencji |
| Nieobecność Klienta | Mistrz ustawia status „nie przyszedł" (dopiero od początku zlecenia) | brak konsekwencji, §5.2 regulaminu niewypełniony `[●]` |
| Wykonanie | Mistrz ustawia „wykonane", Klient odpowiada „potwierdzam" albo „jest problem" + tekst | potwierdzenie Klienta to gotowy dowód faktu wykonania pracy |
| Opinie | tylko po „wykonane", jedna na zlecenie; admin może ukryć; ocena widoczna od 3 opinii | numer telefonu Klienta nie jest weryfikowany |
| Czarna lista | **osobista** u Mistrza, tylko ostrzega (22.11.2026) | ZR nie ma listy wspólnej |
| Weryfikacja numeru Klienta | brak (SMS wyłączone) | można zarezerwować na cudzy numer |
| Strony regulaminu i polityki **na stronie internetowej** | **brak** (są tylko projekty w repozytorium) | zob. rozdz. 9, to pierwsza sprawa |
| Zgoda Klienta na regulamin przy zleceniu | **brak pola wyboru** | zob. rozdz. 9 |
| Akceptacja warunków przez Mistrza | brak: konto zakłada superadministrator, nie ma umowy | zob. rozdz. 6 |

## 3. Trzy relacje umowne

| Relacja | Co to jest | Jak zawierana | Bezpłatnie / odpłatnie |
|---|---|---|---|
| **ZR ↔ Mistrz** | umowa o korzystanie z platformy (+ regulamin dla Mistrzów) | podpisywana przed założeniem konta (rozdz. 6) | obecnie bezpłatnie; model płatności — rozdz. 5 |
| **Mistrz ↔ Klient** | umowa o usługę (prace domowe, naprawy, montaż) | w momencie rezerwacji: zgłoszenie Klienta + potwierdzenie Mistrza | Klient płaci Mistrzowi bezpośrednio |
| **ZR ↔ Klient** | warunki korzystania ze strony (regulamin dla Klientów) + polityka prywatności | akceptowane polem wyboru przy zleceniu (rozdz. 6) | dla Klienta bezpłatnie |

**Zasada:** ZR nie jest stroną ani gwarantem umowy Mistrza z Klientem. **[do prawnika]** Czy to wystarcza, skoro ZR dobiera i szereguje Mistrzów, pokazuje ceny, ustawia timer potwierdzenia i sama rozsyła powiadomienia? Jakich sformułowań i działań unikać, aby ZR nie uznano za stronę ani za odpowiedzialną solidarnie (pytanie 8 z briefu)?

## 4. Kto co jest winien

### 4.1. Mistrz → ZR (proponujemy ująć w umowie)

1. **Status.** Potwierdzić, że prowadzi działalność jako przedsiębiorca (JDG / spółka), podać NIP i formę działalności; w razie potrzeby posiadać uprawnienia (np. elektryczne) i polisę OC. **[do prawnika]** Co obowiązkowo weryfikować i przechowywać (wypis z CEIDG/KRS, OC, uprawnienia)?
2. **Prawdziwy profil:** usługi, ceny, czasy, miasta, zdjęcia, „o mnie"; utrzymywać kalendarz w aktualnym stanie.
3. **Obsługa zleceń:** potwierdzać lub odrzucać zlecenie w terminie, nie przyjmować tego, czego nie może wykonać; przyjeżdżać na czas; jeśli nie zdąży — uprzedzić Klienta przez platformę; nie anulować bez powodu.
4. **Rzetelność:** nie tworzyć fikcyjnych zleceń i opinii (także sobie); nie prosić Klientów o „5 gwiazdek" za rabat; nie wykorzystywać danych Klientów niezgodnie z przeznaczeniem.
5. **Dane Klientów:** przetwarzać jako samodzielny administrator danych (imię, telefon, adres ze zlecenia) wyłącznie w celu wykonania tego zlecenia i własnych obowiązków prawnych; nie sprzedawać ani nie przekazywać osobom trzecim.
6. **Podatki i dokumenty:** wystawiać Klientom fakturę lub paragon (w tym kwestie kasy fiskalnej), płacić podatki — **w całości po stronie Mistrza**.
7. **Odpowiedzialność za pracę:** jakość, gwarancja, szkoda Klienta, reklamacje własnych prac.
8. **Bezpieczeństwo Klientów:** przestrzegać norm, nie wykonywać prac, do których nie ma uprawnień.
9. **Wynagrodzenie ZR** — według wybranego modelu (rozdz. 5).
10. **Własność intelektualna:** licencja dla ZR na wyświetlanie zdjęć, opisów i opinii o Mistrzu na platformie (oraz w zlecai, jeśli Mistrz wyrazi zgodę).
11. **Poufność** wewnętrznych informacji platformy.

### 4.2. ZR → Mistrz (proponujemy)

1. Zapewnić dostęp do platformy: kalendarz, przyjmowanie zleceń, powiadomienia (push, Telegram), profil w katalogu, statystyki.
2. Działać z należytą starannością, **bez gwarancji nieprzerwanej dostępności** (obecnie bezpłatny plan hostingu; będzie płatny). **[decyzja właściciela]** Czy potrzebne SLA? Proponujemy go nie obiecywać.
3. Chronić dane: baza w UE, role i uprawnienia pracowników Mistrza, limity żądań; informować o incydentach.
4. Nie ujawniać danych Mistrza osobom trzecim poza wymienionymi w polityce prywatności (w tym zlecai — tylko za zgodą Mistrza).
5. Przejrzystość: wyjaśniać zasady szeregowania Mistrzów, próg oceny, podstawy ukrycia opinii i blokady konta; dać Mistrzowi prawo sprzeciwu wobec ukrycia opinii.
6. Informować o zmianie warunków z wyprzedzeniem co najmniej N dni **[do prawnika]**.
7. Moderacja opinii i ochrona przed nakręcaniem (już jest).
8. **Nie ingerować** w cenę i płatność między Mistrzem a Klientem.

### 4.3. Klient → ZR i Mistrz (proponujemy do regulaminu dla Klientów)

1. Podawać prawdziwe imię i **własny** numer telefonu; być dostępnym pod nim w dniu zlecenia.
2. Zapewnić Mistrzowi dostęp w uzgodnionym czasie (być w domu, otworzyć drzwi, zapewnić warunki do pracy) oraz bezpieczne warunki.
3. Uprzedzić o anulowaniu lub przełożeniu **z wyprzedzeniem** (w oknie ustawionym przez Mistrza).
4. **Zapłacić za wykonaną pracę** w uzgodnionej formie i kwocie; jeśli kwota zmieniła się z powodu prac dodatkowych — tylko za jego zgodą (§4.3 regulaminu).
5. Nie zamieszczać oczywiście fałszywych ani obraźliwych opinii; nie grozić opinią w zamian za rabat.
6. Zachowywać się kulturalnie; zakaz gróźb, dyskryminacji, nękania Mistrza.
7. Nie wykorzystywać platformy do obchodzenia warunków ani tworzenia fikcyjnych zleceń.

### 4.4. ZR → Klient

1. Bezpłatna usługa rezerwacji, wyświetlanie rzetelnych informacji o Mistrzach (ocena i opinie tylko z prawdziwych zleceń).
2. Terminowe powiadomienia o statusie zlecenia; przejrzyste zasady anulowania i przekładania.
3. Ochrona danych osobowych zgodnie z polityką prywatności.
4. Pomoc w kontakcie z Mistrzem przy reklamacji (bez odpowiedzialności za wynik, §7 regulaminu).

## 5. Pieniądze: jak płaci się za usługi i jak Mistrz płaci platformie

### 5.1. Klient → Mistrz (za pracę)

**Proponujemy pozostawić jak jest: bezpośrednio**, po wykonaniu pracy, gotówką, BLIK-iem lub przelewem, w dniu realizacji. Platforma nie uczestniczy w przepływie pieniędzy, więc nie staje się pośrednikiem płatniczym (inaczej pojawiają się pytania o licencjonowanie usług płatniczych). Uzupełnienia, które warto wprowadzić:

- Mistrz przy potwierdzeniu pokazuje Klientowi **orientacyjną cenę** i warunki dojazdu (zapisuje się to w zleceniu: to eliminuje połowę sporów „ile ustalono");
- jeśli cena zmienia się na miejscu, Mistrz wpisuje nową kwotę do zlecenia przed rozpoczęciem prac dodatkowych, a Klient potwierdza ją na stronie zlecenia (funkcja przyszła);
- po „wykonane" Klient potwierdza pracę (jest) oraz **kwotę końcową**;
- wystawienie faktury lub paragonu to obowiązek Mistrza. **[do prawnika]** Kasa fiskalna i paragony: co musi zrobić Mistrz-przedsiębiorca przy pracach wyjazdowych dla osób fizycznych?

### 5.2. Mistrz → ZR (wynagrodzenie za platformę) [decyzja właściciela]

| Model | Zalety | Wady i ryzyka |
|---|---|---|
| **A. Bezpłatnie (jak teraz)** | szybciej pozyskać Mistrzów, nic nie trzeba liczyć | brak przychodu; brak „dźwigni" w umowie |
| **B. Stały abonament miesięczny** (proponujemy) | prosto, nie zależy od tego, ile Mistrz powie, że zarobił; platforma nie widzi płatności Klientów — abonament tego nie wymaga; faktura VAT raz w miesiącu | Mistrz płaci, nawet gdy zleceń mało; potrzebny okres próbny „pierwsze 1–3 miesiące gratis" |
| **C. Prowizja od zlecenia** | proporcjonalna do zarobku Mistrza | ZR nie widzi realnej płatności (cenę końcową wpisuje Mistrz sam, łatwo ją zaniżyć); platformę obchodzi się „gotówką"; aby widzieć realną płatność, pieniądze trzeba zbierać przez licencjonowanego operatora płatności (Stripe, Przelewy24, BLIK), inaczej całość opiera się na uczciwości Mistrza |
| **D. Stała opłata za każde wykonane zlecenie** | prostsze niż prowizja, nie zależy od ceny | Mistrz może nie oznaczać „wykonane", aby nie płacić; potrzebna weryfikacja |
| **E. Reklama / pierwszeństwo na liście** | odrębny przychód | wymaga przejrzystych zasad szeregowania (pytanie 27 z briefu); obecnie nie ma płatnego promowania |

**Proponujemy etapy:** (1) na razie 2–5 Mistrzów — **bezpłatnie**, umowa i regulamin podpisane; (2) po sprawdzeniu popytu — **abonament B** z bezpłatnym okresem próbnym, płatność przelewem na fakturę; (3) prowizja C lub przedpłata online — **dopiero po podłączeniu operatora płatności** (wtedy też znika większość problemów z niezapłaceniem, rozdz. 8). **[do prawnika]** Jak który model przekłada się na VAT, odpowiedzialność i prawo płatnicze?

### 5.3. Przedpłata i kaucja (na przyszłość)

Ochrona przed nieobecnością i niezapłaceniem: **kaucja lub przedpłata przez BLIK/kartę** przy rezerwacji (np. część kosztu dojazdu). Radykalnie ogranicza przypadki „nie otworzył drzwi" i „nie zapłacił", ale wymaga operatora płatności i warunków zwrotu. **[decyzja właściciela]** Kiedy wprowadzać i dla kogo (wszyscy / nowi Klienci / większe prace).

## 6. Jak podpisywane są umowy (proponujemy)

### 6.1. ZR ↔ Mistrz

1. **Zgłoszenie i weryfikacja** (przed kontem): dokument tożsamości; NIP; wypis z CEIDG lub KRS; polisa OC; uprawnienia; kontakt; miasto pracy. Kopie przechowywać zgodnie z polityką prywatności. **[do prawnika]** okres i zakres przechowywania.
2. **Podpisanie umowy:** proponujemy elektronicznie, **forma dokumentowa** (PDF z podpisem Mistrza i ZR, pisemne przyjęcie); w razie potrzeby — kwalifikowany podpis elektroniczny lub podpis e-mailem z potwierdzeniem. **[do prawnika]** Czy „forma dokumentowa" wystarcza dla umowy B2B z Mistrzem i jaką usługę podpisu elektronicznego wybrać.
3. **Założenie konta** przez superadministratora dopiero po podpisaniu.
4. **Akceptacja regulaminu dla Mistrzów polem wyboru** przy pierwszym logowaniu, z zapisem **wersji dokumentu, czasu i IP**; przy zmianie warunków — ponowna akceptacja (logowania do panelu nie blokujemy, ale ostrzegamy).
5. **Zgoda na przekazanie kontaktów do zlecai** — odrębne pole wyboru (nie w ogólnej umowie).
6. **Zgoda na lokalizację** — osobno, przy włączeniu pokazywania położenia (w aplikacji system i tak o nią prosi).
7. **Zakończenie:** rozwiązanie, termin, co dzieje się z kontem, opiniami i danymi.

### 6.2. Mistrz ↔ Klient

Podpisu nie ma. Umowa zawiera się tak: Klient składa zlecenie (oferta) → Mistrz potwierdza (akceptacja) → Klient otrzymuje potwierdzenie (push, a po uruchomieniu SMS — SMS). **[do prawnika]** Kiedy dokładnie umowę uznaje się za zawartą (przy zleceniu czy przy potwierdzeniu) i co Klient musi zobaczyć wcześniej: identyfikację Mistrza-przedsiębiorcy, cenę, tryb reklamacji, prawo odstąpienia (i jego wyłączenia dla usług domowych na żądanie Klienta).

### 6.3. ZR ↔ Klient

**Pole wyboru przed przyciskiem „Potwierdź rezerwację":** „Akceptuję regulamin i politykę prywatności" z linkami, niezaznaczone domyślnie. Zapisywać: wersję dokumentu, czas, numer zlecenia. Obecnie na stronie nie ma ani stron z dokumentami, ani pola wyboru (rozdz. 9).

## 7. Zasady na stronie (regulamin): struktura dla obu stron

Proponujemy dwie części jednego regulaminu (lub dwa dokumenty), aby Mistrz i Klient widzieli swoje prawa i obowiązki.

**Część I. Postanowienia ogólne:** definicje, rola ZR (narzędzie, nie strona), język, wersje, prawo właściwe, kontakt i reklamacje, zmiany regulaminu.

**Część II. Zasady dla Klientów:**
- rezerwacja i potwierdzenie (timer 15 minut, automatyczne anulowanie);
- cena i płatność (bezpośrednio, cena orientacyjna, zmiana na miejscu tylko za zgodą);
- anulowanie i przełożenie (okno Mistrza; skutki późnego anulowania i nieobecności — zob. rozdz. 8);
- dostęp dla Mistrza, bezpieczeństwo, zachowanie;
- potwierdzenie wykonania („Tak" / „Jest problem");
- reklamacje: najpierw do Mistrza, ZR pomaga w kontakcie;
- opinie: kiedy można, zasady treści, moderacja, prawo Mistrza do odpowiedzi;
- zachowania zabronione i blokada.

**Część III. Zasady dla Mistrzów:** status i dokumenty, rzetelność profilu, obowiązki przy zleceniach (termin potwierdzenia, dojazd, informowanie o opóźnieniu), cena i płatność (faktura ZR według wybranego modelu), anulowanie przez Mistrza (zakazane bezpodstawne), bezpieczeństwo, opinie (zakaz nakręcania, procedura sprzeciwu), dane osobowe Klientów, blokada i usunięcie konta, odpowiedzialność, zakończenie.

**Część IV. Postanowienia końcowe:** odpowiedzialność operatora (ograniczenia wobec konsumentów mają ograniczoną moc, [do prawnika]), przetwarzanie danych (odesłanie do polityki), rozstrzyganie sporów, pozasądowe sposoby (ADR) **[do prawnika]** co obowiązkowo wskazać, zmiany, wejście w życie.

## 8. Nieuczciwy Klient: co może się zdarzyć i co robić

Dla każdego scenariusza: co jest teraz, co **można zrobić w produkcie i w zasadach**, co zostaje po stronie Mistrza.

| Scenariusz | Teraz | Proponujemy w zasadach i produkcie | Co zostaje Mistrzowi |
|---|---|---|---|
| **1. Nie zapłacił po wykonaniu** | platforma się nie wtrąca; Mistrz ma osobistą czarną listę; Klient mógł potwierdzić „praca wykonana" | **Potwierdzenie Klienta pozostaje głównym dowodem** (przechowywać odpowiedź, czas). W regulaminie: Klient ma obowiązek zapłacić; operator nie odpowiada za płatność. Dodać: **kwota końcowa w zleceniu** + potwierdzenie przez Klienta; **eksport historii zlecenia dla Mistrza na potrzeby sądu** na żądanie. Po dwóch potwierdzonych naruszeniach — **blokada numeru przez operatora** (w regulaminie). Dalej: **przedpłata/kaucja online** (rozdz. 5.3) | wystawić fakturę, pisemne wezwanie do zapłaty, **elektroniczne postępowanie upominawcze (e-sąd)** dla roszczeń pieniężnych, egzekucja. **[do prawnika]** sformułowanie i dopuszczalność blokady po numerze |
| **2. Zarezerwował i nie otworzył drzwi / nie było go w domu** | status „nie przyszedł", brak konsekwencji | W regulaminie: Klient odpowiada za dostęp; **Mistrz czeka N minut, dzwoni, odnotowuje nieobecność** (status); powtarzające się nieobecności (np. 2) → blokada. **Opłata za dojazd przy nieobecności** — tylko jeśli podana wcześniej i uzgodniona z prawnikiem (ryzyko klauzul abuzywnych wobec konsumentów) | stracony czas; osobista czarna lista |
| **3. Anulowanie w ostatniej chwili / fałszywe zlecenia** | okno anulowania ustala Mistrz; fałszywe zlecenia możliwe | Ograniczyć liczbę jednoczesnych zleceń „oczekujących" na numer (np. 2); powtarzające się anulowania w oknie — blokada; potwierdzenie numeru kodem SMS | osobista czarna lista, odmowa zlecenia |
| **4. Cudzy lub zmyślony numer, żart** | brak weryfikacji numeru | Kod SMS przy zleceniu (wraz z uruchomieniem SMS); do tego czasu — odrzucać zlecenia, w których numer nie odpowiada | odrzucić |
| **5. Niezadowolenie „dla rabatu", groźba złą opinią** | opinia możliwa dopiero po „wykonane"; admin może ukryć | Zasada: opinia merytoryczna; **opinie nie mogą być warunkiem rabatu**; procedura sprzeciwu Mistrza (§6.5); przy udowodnionym szantażu — blokada | odpowiedź na opinię |
| **6. Skarga na jakość („Jest problem")** | Mistrz otrzymuje tekst skargi | Procedura: Mistrz kontaktuje się w ciągu N dni, proponuje poprawkę lub rabat; ZR pomaga w kontakcie, **nie jest arbitrem**. Jeśli Mistrz nie odpowiada — sankcje wobec Mistrza (rozdz. 8-M) | gwarancja, reklamacja, spory |
| **7. Szkoda w mieniu, uszkodzenia przy pracy** | odpowiedzialność Mistrza | W umowie: **Mistrz odpowiada i musi mieć OC**; Klient dokumentuje uszkodzenie, pisze do Mistrza w rozsądnym terminie; zdjęcia przed/po pracy w zleceniu (przyszłość) | ubezpieczenie, sąd |
| **8. Agresja, groźby, bezpieczeństwo Mistrza** | brak przycisku; Mistrz może odmówić | W regulaminie: zakaz; **prawo Mistrza do odmowy pracy przy zagrożeniu bezpieczeństwa**; blokada; przekazanie danych policji zgodnie z prawem | zgłoszenie na policję |
| **9. Klient żąda zwrotu pieniędzy, kwestionuje płatność (chargeback)** | tylko jeśli płatność nie gotówką: płaci Mistrzowi sam | Stanie się kwestią po płatności online; wtedy potrzebne warunki zwrotu i rozdział ról | zwrot wg umowy |
| **10. Obejście platformy** (Klient odchodzi do Mistrza bezpośrednio) | nie przeszkadza | Przy modelu B (abonament) — dopuszczalne; przy prowizji C — kwestia zakazu i kary umownej. **[do prawnika]** | |

### 8-M. Nieuczciwy Mistrz: lustrzane środki

| Scenariusz | Środki |
|---|---|
| Nie przyjechał / anulował w ostatniej chwili | zapis w statystykach; **próg (np. 3 w okresie) → ostrzeżenie, potem blokada**; Klientowi proponujemy innego Mistrza |
| Nie potwierdził zlecenia w terminie | jest już automatyczne anulowanie i licznik w statystykach; powtórnie → ostrzeżenie |
| Wymuszenie, zawyżenie ceny na miejscu | cena w zleceniu przed rozpoczęciem; Klient potwierdza zmianę; skarga → weryfikacja, blokada |
| Fikcyjne zlecenia i opinie | już jest: zlecenie Mistrza bez zaproszenia do opinii, podpowiedzi w panelu admina, ukrywanie opinii; w umowie — kara umowna/rozwiązanie |
| Przedpłata i zniknięcie | w modelu bez przedpłaty nie występuje; przy przedpłacie online — odrębne warunki zwrotu |
| Nadużycie danych Klienta | zakaz w umowie, odpowiedzialność za dane, rozwiązanie |
| Praca bez uprawnień | uprawnienie zadeklarowane w profilu = odpowiedzialność Mistrza; prawo ZR do żądania potwierdzenia i blokady |

### 8.1. Wspólna lista sankcji potrzebnych w regulaminie

1. Ostrzeżenie (Klient/Mistrz).
2. Czasowa blokada (np. 30 dni).
3. Trwała blokada konta lub numeru.
4. Ukrycie opinii / odmowa publikacji.
5. Dla Mistrza: rozwiązanie umowy.
6. Przekazanie danych organom na żądanie.

**Zasady:** podstawa sankcji musi być w regulaminie z góry; użytkownik może **się sprzeciwić** i otrzymać odpowiedź; decyzja jest odnotowywana. **[do prawnika]** Dopuszczalność blokady numeru Klienta i przechowywania informacji o naruszeniach (jaka podstawa wg RODO, okres przechowywania, prawo sprzeciwu).

## 9. Co zmienić w produkcie pod te zasady

| Nr | Co | Priorytet | Po co |
|---|---|---|---|
| 1 | **Strony** regulaminu i polityki prywatności na stronie (pl/en), wersja i data | pierwszy (przed startem Mistrzów) | obowiązkowe obowiązki informacyjne |
| 2 | **Pole wyboru** zgody na regulamin i politykę przy zleceniu + zapis akceptacji (wersja, czas, zlecenie) | pierwszy | podstawa sankcji i przetwarzania danych |
| 3 | Akceptacja regulaminu przez Mistrza przy logowaniu (wersja, czas, IP) | pierwszy | stosunek umowny |
| 4 | Uzupełnić luki w regulaminie: okno anulowania, skutki nieobecności (§5), termin rozpatrzenia sprzeciwów (§6.5), odpowiedzialność (§8.3) | pierwszy | obecnie jest tam `[●]` |
| 5 | Powód „Klient nie otworzył drzwi" osobno od ogólnej nieobecności + próg powtórzeń | drugi | rozróżnianie przypadków |
| 6 | Kwota końcowa w zleceniu + potwierdzenie przez Klienta | drugi | dowód w sporze o płatność |
| 7 | Kod SMS potwierdzający numer (wraz z uruchomieniem SMS) | drugi | fikcyjne zlecenia, nakręcanie |
| 8 | Blokada numeru Klienta przez operatora + procedura sprzeciwu | drugi | powtarzający się naruszyciele |
| 9 | Zdjęcia przed/po w zleceniu | trzeci | spory o jakość i szkody |
| 10 | Przedpłata/kaucja online przez licencjonowanego operatora | trzeci | nieobecność, niezapłacenie |
| 11 | Faktury VAT dla Mistrzów z abonamentu | w miarę uruchamiania modelu B | |
| 12 | Strona „Zasady szeregowania Mistrzów" (ocena, próg 3 opinii) | trzeci | przejrzystość |

## 10. Decyzje właściciela przed wysłaniem prawnikowi

1. Model wynagrodzenia: A / B / C / D oraz **kiedy** wprowadzać (rozdz. 5.2).
2. Czy potrzebna przedpłata lub kaucja i od kiedy (rozdz. 5.3).
3. Czy wprowadzać **opłatę za dojazd przy nieobecności Klienta** (i w jakiej wysokości), czy tylko ostrzeżenie i blokadę.
4. Domyślne okno bezpłatnego anulowania przez Klienta (obecnie 120 minut u Mistrza) i wspólne minimum.
5. Progi sankcji: ile nieobecności lub anulowań do blokady (Klient i Mistrz).
6. Czy potrzebna **wspólna blokada numeru Klienta** przez operatora (ryzyko prawne; decyzja „tylko z procedurą sprzeciwu").
7. Forma umowy z Mistrzem: PDF z podpisem czy podpis elektroniczny przez usługę.
8. Czy obaj Mistrzowie są gotowi podpisać umowę i przedstawić dokumenty (forma działalności, OC, uprawnienia)?
9. Okres przechowywania danych o naruszeniach i logów akceptacji warunków.
10. Język dokumentów: polski wiążący; rosyjski i angielski — tłumaczenia robocze.

## 11. Pytania do prawnika (według ważności)

**Umowy i odpowiedzialność**
1. Jaka konstrukcja umowy ZR–Mistrz (SaaS, usługa elektroniczna, agencyjna) i jaka forma podpisu jest wystarczająca.
2. Jak sformułować rolę ZR, aby nie stać się stroną ani nie odpowiadać solidarnie za usługę (pytanie 8 z briefu).
3. Czy dopuszczalne są ograniczenia odpowiedzialności operatora i do jakiego poziomu wobec konsumentów i wobec przedsiębiorców.
4. Obowiązkowe postanowienia umowy z Mistrzem: status, uprawnienia, OC, podatki, odpowiedzialność za pracę, ochrona danych, licencja na treści, rozwiązanie, termin informowania o zmianach.

**Płatności i podatki**
5. Model wynagrodzenia: VAT, faktury, abonament i prowizja, wpływ na prawo płatnicze (platforma bez przyjmowania płatności i przy przedpłacie online).
6. Kasa fiskalna, paragon i faktura dla Mistrzów pracujących u Klientów w domu.
7. Warunki przedpłaty, kaucji i zwrotu przy płatności online.

**Klient-konsument**
8. Moment zawarcia umowy Mistrz–Klient; informacje, które trzeba pokazać przed zleceniem (identyfikacja Mistrza, cena, reklamacje, prawo odstąpienia i jego wyłączenia dla usług domowych „na żądanie Klienta").
9. Skutki nieobecności i spóźnionego anulowania przez Klienta: czy dopuszczalna jest opłata za dojazd wobec konsumenta; ryzyko klauzul abuzywnych.
10. Reklamacje i gwarancja na wykonane prace; pozasądowe sposoby rozwiązywania sporów i co należy wskazać w regulaminie.

**Nieuczciwe strony**
11. Dopuszczalność blokady numeru Klienta, przechowywania informacji o naruszeniach (podstawa, okres), prawa Klienta do sprzeciwu; czy **osobista** lista Mistrza (jest) jest dopuszczalna, a **wspólna** (Mistrzowie widzą cudze oznaczenia) niedopuszczalna.
12. Procedury sankcji (ostrzeżenie, blokada, rozwiązanie): co obowiązkowo wskazać w regulaminie.
13. Dochodzenie niezapłaconych należności: w czym może pomagać operator (wyciąg z historii, potwierdzenie Klienta) i jakie ograniczenia RODO przy przekazaniu Mistrzowi lub sądowi.
14. Agresja i groźby wobec Mistrza: prawo odmowy i dane dla policji.
15. Fikcyjne zlecenia i opinie, szantaż opinią: podstawy i procedura.

**Platforma i dane**
16. Akceptacja regulaminu: pole wyboru, wersje, okres przechowywania logów akceptacji; ponowna akceptacja przy zmianie.
17. Role w zakresie danych Mistrza i operatora (samodzielni czy współadministratorzy), umowa między nimi.
18. Przejrzystość szeregowania Mistrzów (ocena, próg 3 opinii) i moderacji opinii.

## 12. Dalej

Po Państwa decyzji w rozdz. 10: (1) prawnik weryfikuje rozdz. 3–8 i 11; (2) dopisujemy regulamin i umowę z Mistrzem; (3) robimy w produkcie punkty 1–4 z rozdz. 9 (strony i pola wyboru), bez których nie wolno uruchamiać Mistrzów.
