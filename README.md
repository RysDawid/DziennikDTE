# DTE — Dziennik Techniczno-Eksploatacyjny (CNE)

Wewnętrzne narzędzie personelu technicznego centrum nauki do prowadzenia
dziennika stanu eksponatów, zgłoszeń usterek, zamówień i projektów.

Dokument dzieli się na trzy części — zacznij od tej, która Cię dotyczy:

| Część | Dla kogo | Co znajdziesz |
|---|---|---|
| [1. Opis projektu i koncepcja](#1-opis-projektu-i-koncepcja) | wszyscy | czym jest DTE, jak jest pomyślany i dlaczego tak |
| [2. Dla użytkownika](#2-dla-użytkownika) | personel CNE | jak używać aplikacji na co dzień |
| [3. Dla developera](#3-dla-developera) | osoba rozwijająca kod | architektura, API, konwencje, wdrożenie |

---

# 1. Opis projektu i koncepcja

## Czym jest DTE

CNE to centrum nauki — interaktywne wystawy i eksponaty dla zwiedzających.
Eksponaty się psują, wymagają serwisu, części i planowanych prac. DTE
(**D**ziennik **T**echniczno-**E**ksploatacyjny) to narzędzie, w którym
personel techniczny prowadzi to wszystko w jednym miejscu, zamiast w
zeszytach, mailach i arkuszach.

Aplikacja obsługuje trzy obszary pracy:

1. **Raport dzienny** — codzienna inspekcja stanu każdego eksponatu na
   wystawie (sprawny / w serwisie / usterka / inne / wyłączony z wystawy),
   z opisem i zdjęciami. Każdy dzień jest archiwizowany osobno, dzięki czemu
   powstaje historia stanu wystawy dzień po dniu.
2. **Problemy, Zakupy, Eksploatacja** — zgłoszenia usterek, zamówienia
   części i osobna lista prac eksploatacyjnych. Każde jako „karta" z
   priorytetem, opisem, zdjęciami i wątkiem rozmowy między warsztatem
   a biurem.
3. **Projekty i Przerwy techniczne** — dłużej trwające tematy prowadzone
   jako oś czasu wpisów (jak wątek na forum), gdzie każdy wpis może zawierać
   dowolne elementy: opis, link, zdjęcia, kontakt, cenę.

## Założenia projektowe (i dlaczego takie)

Te decyzje są celowe — jeśli będziesz rozwijać projekt, warto je znać, zanim
zaczniesz je zmieniać.

**Brak bazy danych.** Wszystko trzyma się w plikach JSON (`data/`) i plikach
na dysku (`uploads/`). Powód: skala jest mała (dziesiątki kart, kilkadziesiąt
kilobajtów danych), a brak bazy oznacza brak osobnej usługi do zainstalowania,
skonfigurowania i utrzymania. Dane da się w razie potrzeby obejrzeć i poprawić
zwykłym edytorem tekstu.

**Brak kroku budowania (build stepu).** Frontend to Vue 3 ładowane
bezpośrednio przez przeglądarkę jako natywne moduły ES. Nie ma npm, Webpacka
ani Vite. Powód: wdrożenie i aktualizacja sprowadzają się do skopiowania
plików — nikt nie musi pamiętać o „przebuduj przed wysłaniem", a projekt nie
gnije przez zależności narzędziowe.

**Zależności zwendorowane lokalnie.** Vue, Sortable.js, Fuse.js, ikony
Phosphor i font Inter leżą w `static/vendor/`. Powód: sieć CNE przechwytuje
TLS, przez co publiczne CDN-y (unpkg, jsdelivr, Google Fonts) bywają
niedostępne. Aplikacja nie odwołuje się do niczego poza własnym serwerem.

**Brak logowania i kont użytkowników.** Każdy, kto ma dostęp do sieci
lokalnej i zna adres, może wszystko. Powód: to narzędzie dla małego,
zaufanego zespołu w sieci wewnętrznej, a logowanie byłoby barierą przy
codziennym użyciu (np. szybki wpis z telefonu na hali). Konsekwencje tej
decyzji opisuje [rozdział o bezpieczeństwie](#bezpieczeństwo--co-warto-wiedzieć).

**Praca na żywo dla wszystkich naraz.** Zmiana wprowadzona na jednym
urządzeniu pojawia się natychmiast u pozostałych (WebSocket). Powód: warsztat
i biuro pracują na tych samych zgłoszeniach równolegle i muszą widzieć
aktualny stan bez odświeżania.

**Wszystko po polsku.** Nazwy zmiennych, komentarze w kodzie, teksty
interfejsu i dane domenowe. Powód: to narzędzie polskiego zespołu, a domena
(eksponat, przerwa techniczna, zapotrzebowanie) nie ma naturalnych
odpowiedników w kodzie po angielsku.

## Stan projektu

Działa i jest używane produkcyjnie: Raport dzienny, Problemy, Zakupy,
Eksploatacja, Projekty, Przerwa techniczna, wraz z archiwum, zdjęciami,
załącznikami i pracą na żywo.

W przygotowaniu: zakładka **Dashboard** — docelowo archiwum wszystkich
działań i statystyki eksponatów. Obecnie pokazuje informację „moduł w
przygotowaniu".

---

# 2. Dla użytkownika

## Gdzie znaleźć aplikację

Aplikacja działa na serwerze w sieci CNE — **nie instalujesz niczego**.
Otwierasz przeglądarkę i wchodzisz pod adres:

```
http://172.18.10.7:8000
```

Działa na komputerze, tablecie i telefonie (byle w tej samej sieci). Warto
dodać zakładkę albo skrót na pulpicie telefonu.

Wszyscy pracują na tych samych danych: jeśli ktoś doda zgłoszenie albo zmieni
stan eksponatu, zobaczysz to **od razu**, bez odświeżania strony.

## Zakładki

### Raport dzienny

Codzienna inspekcja wystawy. Widzisz listę wszystkich eksponatów i ustawiasz
każdemu **stan**:

| Stan | Znaczenie |
|---|---|
| sprawny | działa normalnie |
| serwis | w trakcie planowanej obsługi |
| usterka | zepsuty, wymaga naprawy |
| inne | sytuacja niestandardowa (opisz w polu tekstowym) |
| poza wystawą | wyłączony z ekspozycji |

Do stanu możesz dodać **status** (gotowe do wyboru podpowiedzi, np. „Naprawa
mechaniczna"), **opis** i **zdjęcia**.

Ważne rzeczy o raporcie:

- **Zapisuje się sam** — nie ma przycisku „zapisz", zmiany lecą na serwer
  automatycznie chwilę po tym, jak przestaniesz pisać.
- **Edytować można tylko dzisiejszy dzień.** Starsze dni są dostępne do
  odczytu — to zamknięta historia, celowo nie do poprawiania wstecz.
- **Nowy dzień startuje od stanu z ostatniego zapisu** — nie musisz co rano
  wypełniać wszystkiego od zera, tylko nanosisz to, co się zmieniło.

### Problemy, Zakupy, Eksploatacja

Trzy listy działające tak samo, różnią się przeznaczeniem: usterki do
naprawy, rzeczy do kupienia, prace eksploatacyjne. Każdy wpis to **karta**
zawierająca:

- **priorytet** — pilne / oczekujące / przyszłościowe (kolorowy pasek karty),
- **lokalizację** — którego eksponatu lub strefy dotyczy,
- **opis** i **zdjęcia**,
- **załączniki** — dowolne pliki (oferta PDF, instrukcja, itp.),
- **czat** — wątek rozmowy, w którym przy wysyłaniu wiadomości wybierasz, czy
  piszesz jako **warsztat**, czy jako **biuro**.

Karty można przeciągać, żeby zmienić kolejność, oraz **przenosić między
tymi trzema listami** (np. zgłoszenie okazało się zamówieniem części).

### Projekty, Przerwa techniczna

Do tematów, które ciągną się dłużej i mają swoją historię. Zamiast jednego
opisu karta zawiera **oś czasu wpisów** (najnowszy na górze), a każdy wpis
składa się z dowolnie dobranych elementów:

| Element | Do czego |
|---|---|
| opis | zwykły tekst |
| link | adres www albo ścieżka do folderu w sieci |
| media | zdjęcia |
| kontakt | dane osoby/firmy |
| cena | kwota |

Kartę można otworzyć **na pełny ekran** — wygląda wtedy jak wątek na forum i
wygodniej się czyta dłuższą historię.

Element **link** działa dwojako: jeśli wpiszesz adres strony, otworzy się w
nowej karcie przeglądarki; jeśli wpiszesz ścieżkę do folderu w sieci (np.
`P:\Zamówienia\...`), aplikacja otworzy ten folder w eksploratorze plików
na komputerze, na którym działa serwer.

### Dashboard

Moduł w przygotowaniu — docelowo statystyki i przegląd wszystkich działań.

## Rzeczy wspólne dla wszystkich zakładek

**Zdjęcia.** Dodasz je przeciągając plik, wybierając z dysku, robiąc zdjęcie
telefonem, albo wklejając ze schowka (Ctrl+V). Kliknięcie w zdjęcie otwiera
je na pełnym ekranie z powiększaniem.

**Zamykanie kart (Historia).** Gdy temat jest załatwiony, **archiwizujesz**
kartę — znika z listy, ale zostaje w panelu **Historia** (przycisk z ikoną
zegara). Tam możesz ją przeglądać, przeszukiwać i w razie potrzeby
**przywrócić** z powrotem na listę. To jest odwracalne i tak należy zamykać
tematy na co dzień.

**Usuwanie trwałe.** W Historii jest też opcja usunięcia karty na zawsze —
razem ze zdjęciami. **Tego nie da się cofnąć.** Aplikacja zawsze pyta o
potwierdzenie. Używaj tylko do rzeczy stworzonych przez pomyłkę.

**Menu kontekstowe.** Prawy przycisk myszy (lub dłuższe przytrzymanie palcem
na telefonie) na elemencie karty otwiera menu z dodatkowymi akcjami.

**Wygląd.** W rogu ekranu są przyciski: powiększenie/pomniejszenie
interfejsu (przydatne na dużym ekranie w warsztacie) i przełącznik trybu
jasny/ciemny. Ustawienia zapamiętują się w tej przeglądarce.

## Menu techniczne (pod hasłem)

Kliknięcie w **logo** otwiera menu techniczne zabezpieczone hasłem. Są tam
dwie rzeczy administracyjne:

- **Import archiwum** — wgranie kopii danych z pliku ZIP.
- **Aktualizuj kod** — pobranie nowej wersji aplikacji i automatyczny restart
  serwera (kilka sekund przerwy dla wszystkich).

Hasło ma osoba opiekująca się aplikacją. Jeśli nie wiesz, po co Ci to menu —
nie potrzebujesz go.

## Bezpieczeństwo — co warto wiedzieć

Aplikacja **nie ma logowania**. To znaczy, że:

- każdy, kto jest w sieci CNE i zna adres, może przeglądać i zmieniać
  wszystko — łącznie z trwałym usuwaniem kart,
- **nie da się sprawdzić, kto co zrobił** — nie ma historii „kto zmienił".
  Dlatego w czacie kart wybiera się ręcznie „warsztat" albo „biuro" — to
  jedyna informacja o autorze,
- aplikacja jest dostępna **tylko z sieci wewnętrznej**, nie z internetu.

To świadomy kompromis na rzecz wygody w małym, zaufanym zespole.

## Coś nie działa

- **Strona się nie ładuje** — sprawdź, czy jesteś w sieci CNE (nie na
  gościnnym WiFi ani na transmisji z telefonu). Jeśli tak, zgłoś się do
  osoby opiekującej się aplikacją — serwer mógł się zatrzymać.
- **Zmiany innych osób nie pojawiają się na żywo** — odśwież stronę. Jeśli
  problem wraca, zgłoś.
- **Zdjęcie się nie wgrywa** — zwykle bardzo duży plik albo słaby zasięg;
  spróbuj ponownie.

Dane są kopiowane automatycznie każdej nocy, więc nawet w razie poważnej
awarii da się je odzyskać z ostatniej doby.

---

# 3. Dla developera

Ta część zakłada zero wcześniejszej wiedzy o kodzie, ale nie tłumaczy podstaw
FastAPI/Vue — skupia się na tym, co specyficzne dla tego repozytorium:
strukturze, konwencjach, pułapkach i wdrożeniu.

## 3.1 Stos technologiczny

- **Backend**: Python 3.12, FastAPI + Uvicorn, WebSocket (natywny FastAPI),
  **brak bazy danych** — trwałość na plikach JSON (`json.dump` z atomowym
  zapisem przez `.tmp` + `Path.replace`).
- **Frontend**: Vue 3 (Composition API), **bez kroku budowania** — ESM
  ładowane bezpośrednio przez przeglądarkę (`<script type="module">` +
  `importmap`). Żadnego Webpacka/Vite/npm w runtime.
- **Zależności zwendorowane lokalnie** w `static/vendor/` (Vue, Sortable.js,
  Fuse.js, Phosphor Icons, font Inter) — **żadnych CDN-ów w produkcji**.
  Powód: sieć CNE ma przechwytywanie TLS (`ERR_CERT_COMMON_NAME_INVALID`
  na unpkg/jsdelivr/Google Fonts), więc zewnętrzne CDN-y bywają niedostępne.
  Jeśli trzeba dodać nową zależność JS/CSS — **pobierz i zwendoruj ją**,
  nie linkuj do CDN.
- Brak frameworka CSS — ręczny system tokenów (custom properties) w
  `static/css/main.css`.

## 3.2 Uruchomienie lokalne

```bash
./run.sh                  # domyślnie port 8000, host 0.0.0.0 (widoczny w LAN)
./run.sh 8080             # inny port
HOST=127.0.0.1 ./run.sh   # tylko lokalnie
```

`run.sh`/`run.bat` same tworzą `.venv`, instalują `requirements.txt` (tylko
gdy hash się zmienił) i odpalają `uvicorn main:app --host $HOST --port $PORT`.
Backend przy starcie wypisuje adresy LAN, pod którymi inne stanowiska mogą
się podłączyć (przeglądarka, bez instalacji niczego).

`run.bat` na Windows nie wymaga wcześniej zainstalowanego Pythona: jeśli go
nie znajdzie na PATH, sam pobiera oficjalny przenośny pakiet „embeddable"
Python 3.12 z python.org do folderu `.python-embed` obok aplikacji (bez
instalatora, bez uprawnień administratora) i używa go zamiast systemowego —
przydatne na stanowiskach, gdzie Python nigdy nie będzie instalowany ręcznie.
Wymaga to jednorazowo internetu; kolejne uruchomienia już nic nie pobierają.

Dev z autoreloadem: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
(uwaga: `--reload` obserwuje tylko pliki `.py` — zmiany w `static/js/*.js`
wymagają odświeżenia karty w przeglądarce, cache przeglądarki bywa
agresywny przy plikach JS/CSS ładowanych jako moduły).

`optimize_images.py` — osobny, ręcznie uruchamiany skrypt do kompresji
zdjęć w `img/`/`uploads/` (domyślnie dry-run, `--apply` żeby faktycznie
nadpisać).

**Zmienna środowiskowa `DTE_ADMIN_HASLO`** — hasło do menu technicznego
(import archiwum, aktualizacja kodu). Bez niej te funkcje są całkowicie
zablokowane. Ustawia się ją tam, gdzie proces jest uruchamiany (np. linia
`Environment=DTE_ADMIN_HASLO=...` w pliku systemd) — **nigdy w kodzie/gicie**.

## 3.3 Struktura katalogów

```
main.py                    Cały backend (jeden plik, ~950 linii)
requirements.txt
run.sh / run.bat           Skrypty startowe (tworzą venv, instalują, odpalają)
optimize_images.py         Ręczna kompresja zdjęć (nie jest częścią serwera)

data/                      Stan "referencyjny" + kolekcje kart (JSON, źródło prawdy)
  lokacje.json              Hierarchia: wystawy → pod-lokalizacje → nazwy eksponatów
  statusy.json               Predefiniowane statusy raportu, wg kategorii stanu
  eksponaty_img.json         Ręczny override mapowania nazwa eksponatu → plik zdjęcia
  problemy.json / zakupy.json / eksploatacja.json   Kolekcje kart "klasycznych"
  przerwa.json / projekty.json                       Kolekcje kart "modularnych"

arch/RRRR/MM/DD/raport.json   Migawka raportu dziennego per dzień (archiwum;
                               dzisiejszy plik jest edytowalny, starsze read-only)

uploads/<kontekst>/<owner_id>/<plik>   Wgrane zdjęcia/media, per karta/eksponat
                               kontekst = nazwa kolekcji (problemy/zakupy/…) albo "raport"

img/wystawa/                  Zdjęcia eksponatów (statyczne, z repo)
img/logo/                     Logo aplikacji

static/
  index.html                  Jedyny punkt wejścia HTML; importmap + <link>i
  js/
    app.js                    Root Vue: powłoka, tabbar, routing zakładek,
                               globalne dyrektywy (v-skel, v-autogrow, v-spellfocus)
    store.js                  Globalny reaktywny stan + klient WS + wywołania API
    utils.js                  fuzzy(), formatowanie dat, chatTime(), asColor(),
                               hardReloadAfterRestart()
    tabs/                     Jeden plik = jedna zakładka górnego paska
      Raport.js                Raport dzienny (największy plik frontendu, ~600 linii)
      Problemy.js / Zakupy.js / Eksploatacja.js   Cienkie wrappery nad cardTab.js
      cardTab.js                Współdzielona logika kart "klasycznych" (useCardTab)
      PrzerwaTechniczna.js / Projekty.js   Cienkie wrappery nad modularTab.js
      modularTab.js             Współdzielona logika kart "modularnych" (useModularTab)
    components/
      ModularCard.js            Komponent karty modularnej (Przerwa/Projekty)
      ContextMenu.js             Reużywalne menu kontekstowe (prawy klik / long-press)
      MediaUpload.js             Modal uploadu (drag&drop / paste / aparat)
      ImageModal.js               Lightbox pełnoekranowy z zoom/pan/pinch
      FuzzySelect.js               Dropdown z fuzzy search (Fuse.js)
      HistoryPanel.js              Panel "Historia" — zarchiwizowane karty kolekcji
      AttachmentUpload.js          Modal uploadu dowolnych plików (nie tylko zdjęć)
      TechMenu.js                   Bramka hasłem (ukryta pod logo) + menu admina
      ImportArchiwum.js            Modal admina: import data/uploads/arch z zipa
      GitUpdate.js                 Modal admina: git pull + auto pip install + self-restart
  css/
    main.css                    Tokeny (kolory/spacing/cienie), reset, layout appki
    components.css               Style komponentów współdzielonych (menu, upload, modal…)
    karty.css                    Style kart "klasycznych" (.karta, .cardtab__bar, .krow…)
    przerwa.css                  Style kart "modularnych" (.pcard, .pupd, .pel…)
    raport.css                    Style zakładki Raport dzienny
    inter.css                    @font-face dla lokalnie zwendorowanego fontu Inter
  vendor/                       Zwendorowane zależności (Vue/Sortable/Fuse/Phosphor/Inter)
```

## 3.4 Backend (`main.py`) — mapa API

Jeden plik, bez routerów/blueprintów. Stan kolekcji trzymany jest **w
pamięci procesu** (listy `dict` załadowane raz przy starcie z `load_json`) i
zapisywany na dysk po każdej mutacji (`save_json`, atomowo). **Restart
procesu = przeładowanie z dysku** — więc jeśli coś edytujesz ręcznie w
`data/*.json` podczas gdy serwer działa, twoja zmiana zostanie nadpisana
przy najbliższym zapisie z pamięci, chyba że wcześniej zrestartujesz serwer.

### Dane referencyjne (read-mostly)
- `GET /api/bootstrap` — lokacje + statusy + dzisiejsza data, ładowane raz przy starcie klienta.
- `GET /api/lokacje`, `GET /api/statusy`
- `PATCH /api/eksponat/foto`, `PATCH /api/eksponat/nazwa` — edycja master-data eksponatu; rozsyłane przez WS (`channel: "lokacje"`) do wszystkich klientów jako „hot reload" bez restartu.

### Raport dzienny
- `GET /api/raport/{YYYY-MM-DD}` — dla dzisiejszej daty bez istniejącego pliku: zasiewa stan z `_previous_states()` (ostatni zapisany rekord per eksponat). Starsze daty: read-only (`editable: false`).
- `PUT /api/raport/{YYYY-MM-DD}` — tylko dla dzisiejszej daty (403 dla innych), nadpisuje cały plik dnia.
- `GET /api/raport-historia?przed=YYYY-MM-DD&limit=60` — lista dni do osi czasu historii.

### Karty — generyczne endpointy pod `/api/{name}`
`name` ∈ `COLLECTIONS` dict: `problemy | zakupy | eksploatacja | przerwa | projekty`.
Dodanie nowej kolekcji kartowej = dopisanie jej do `COLLECTIONS` (+ ew. do
`create_card`, jeśli ma inny kształt niż domyślny „klasyczny").

- `GET /api/{name}` — tylko niearchiwalne.
- `POST /api/{name}` — tworzy kartę. Kształt zależy od `name`: `przerwa`/`projekty` dostają `{status, updates: []}`, reszta dostaje `{priorytet, lokalizacja, opis, zdjecia: [], komentarze: []}`.
- `PATCH /api/{name}/{id}` — częściowa aktualizacja (allowlist pól: `tytul, priorytet, lokalizacja, opis, zdjecia, zdjeciaAlt, status, updates`).
- `POST /api/{name}/{id}/komentarz`, `PATCH .../komentarz/{msgId}`, `DELETE .../komentarz/{msgId}` — czat karty klasycznej (usuwanie miękkie: treść czyszczona, `usunieta: true`).
- `POST /api/{name}/reorder` — nowa kolejność wg listy ID.
- `DELETE /api/{name}/{id}` — **archiwizacja** (miękkie, `archiwum: true`).
- `DELETE /api/{name}/{id}/trwale` — **twarde usunięcie** (nieodwracalne, kasuje też katalog `uploads/{name}/{id}`).
- `POST /api/{name}/{id}/przenies` — przenosi kartę do innej kolekcji razem z uploadami (przemapowuje URL-e zdjęć).

### Administracyjne (za hasłem)
- `POST /api/admin/auth` — weryfikuje hasło (`{haslo}`) przeciw `DTE_ADMIN_HASLO` (zmienna środowiskowa). Bez ustawionej zmiennej na serwerze funkcje admina są **całkowicie zablokowane**, nie „otwarte domyślnie". Używane przez `TechMenu.js` do odblokowania menu (hasło potem trzymane w `sessionStorage`, wysyłane przy każdym wywołaniu poniższych dwóch endpointów).
- `POST /api/admin/import-archiwum` — multipart upload zipa (pole `plik`) + `haslo`, z `data/`/`uploads/`/`arch/` (np. spakowanych ręcznie z instalacji produkcyjnej: `zip -r archiwum.zip data uploads arch`), żeby odtworzyć dane na świeżym klonie (te katalogi nie są w gicie). Waliduje ścieżki wpisów (ochrona przed zip-slip), przenosi bieżącą zawartość podmienianych top-level katalogów do `_backup/<znacznik czasu>/` zamiast ją kasować, przeładowuje kolekcje `data/*.json` w pamięci procesu i rozsyła `WS {channel:"system", action:"restore"}`, żeby inne podłączone karty przeglądarki się przeładowały.
- `POST /api/admin/aktualizuj` — `{haslo}` w body. `git pull --ff-only` w katalogu appki; jeśli coś się zmieniło i `requirements.txt` był wśród zmienionych plików, doinstalowuje zależności (`pip install -r requirements.txt` przez `sys.executable`, czyli interpreter z tego samego venv), rozsyła klientom WS `system/code-update`, po czym proces **twardo się kończy** (`os._exit`) — wymaga to `Restart=always` w systemd (albo równoważnego nadzorcy) na serwerze, inaczej appka nie wstanie z powrotem. Każdy proces ma losowy `bootId`; klient czeka na jego zmianę, a potem przechodzi na URL z wersją nowego commita. Odpowiedzi HTML/JS/CSS mają `Cache-Control: no-store`, więc nowy UI jest widoczny bez ręcznego Ctrl+Shift+R. `--ff-only` celowo nie tworzy merge commitów — jeśli ktoś edytował pliki bezpośrednio na serwerze (lub historia się rozjechała), pull ma jawnie zawieść z czytelnym błędem zamiast czegoś nadpisać.
- UI dla obu powyższych: ukryte pod kliknięciem w logo (`TechMenu.js`) — najpierw hasło, potem lista akcji. Nie ma stałych przycisków w pasku sterowania (świadomie: appka nie ma kont użytkowników, więc to jedyna bramka przed funkcjami, które nadpisują dane/kod).

### Inne
- `POST /api/upload/{kontekst}/{owner_id}` — multipart upload, zapisuje do `uploads/{kontekst}/{owner_id}/`, zwraca listę URL-i.
- `POST /api/open-path` — **musi być zarejestrowany PRZED `/api/{name}`** (patrz pułapka niżej). Otwiera lokalną ścieżkę (folder/plik) w natywnym eksploratorze plików hosta (`os.startfile` na Windows, `open` na macOS, `xdg-open` na Linuksie). Używane przez element „link" w kartach modularnych, gdy treść nie jest adresem `http(s)://`.
- `WS /ws` — jeden kanał dla wszystkich zdarzeń. Wiadomość: `{channel, action, payload}`. `channel` = nazwa kolekcji (`problemy`/`raport`/`lokacje`/…), `action` ∈ `create|update|comment|comment-edit|archive|delete|reorder`. Broadcast do **wszystkich** podłączonych klientów (w tym nadawcy — klient sam sobie też odbiera własne zmiany, `store.js` ma idempotentne guardy typu `if (!list.some(c => c.id === payload.id))`).

### ⚠️ Pułapka: kolejność rejestracji tras FastAPI
`@app.post("/api/{name}")` (tworzenie karty) jest **catch-all** dla
jednosegmentowych ścieżek pod `/api/`. Każdy nowy endpoint literalny typu
`/api/cokolwiek` (jeden segment po `/api/`) musi być zdefiniowany **przed**
tym catch-allem w kolejności w pliku, inaczej trafi tam jako `{name}` i np.
POST zamiast otworzyć folder utworzy nową „kartę" w nieistniejącej kolekcji
(404 „Nieznana kolekcja"). Endpointy dwusegmentowe (`/api/upload/{a}/{b}`)
nie kolidują. Ten błąd już raz się zdarzył przy dodawaniu `/api/open-path`
— patrz komentarz w `main.py` nad tym endpointem.

## 3.5 Frontend — architektura

### Bootstrapping i stan globalny
`app.js` tworzy appkę Vue i montuje ją; **cały stan aplikacji żyje w
`store.js`** jako pojedynczy `reactive()` obiekt (nie Pinia/Vuex — ręczny,
płaski store). `store.boot()`:
1. pobiera `/api/bootstrap` + wszystkie kolekcje kart,
2. ładuje raport dzisiejszego dnia,
3. otwiera WebSocket (`connectWS()`, auto-reconnect co 1.5s przy zerwaniu).

Każda mutacja idzie **optymistycznie lokalnie + asynchronicznie do API**
(patrz `patchCard`: aktualizuje `this[coll]` od razu, debounce 350ms na
faktyczny `PATCH`). Zmiany od innych klientów przychodzą przez WS i trafiają
do tego samego store (`_onWS`) — więc UI reaguje identycznie niezależnie od
źródła zmiany (lokalne kliknięcie vs. zdarzenie sieciowe).

### Routing zakładek
Brak Vue Router. `store.activeTab` (string) + `<component :is="...">` w
`app.js`, komponenty owinięte w `<KeepAlive>` (przełączanie zakładek nie
re-montuje ich — zachowuje scroll/stan lokalny). Nowa zakładka = wpis w
tablicy `TAB_GROUPS` w `app.js` (`{id, label, comp}`); zakładki bez `comp`
dostają generyczny `PlaceholderComp` („moduł w przygotowaniu").

### Dwa systemy kart — nie mylić
To jest **najważniejsza rzecz do zrozumienia** we frontendzie, bo są dwie
równoległe, nieudostępniające sobie kodu implementacje „karty":

**1. Karty „klasyczne"** (Problemy, Zakupy, Eksploatacja) — `.karta` w
`karty.css`, logika w `cardTab.js` (`useCardTab(coll, opts)`). Model: 3-stopniowy
priorytet (`pilne/oczekujace/przyszlosc`), pojedynczy `opis` (textarea),
`zdjecia` (galeria + lightbox), `komentarze` (wątek czatu z dwoma
„autorami": `warsztat`/`biuro`, edycja/usuwanie miękkie). Karty da się
przenosić między tymi trzema kolekcjami (`CARD_COLLECTIONS` w `cardTab.js` —
dopisanie tam nowej kolekcji automatycznie włącza ją jako cel „Przenieś do"
we wszystkich trzech zakładkach, stąd komentarz „modularnie" w kodzie).
Każda zakładka (`Problemy.js` itd.) to cienki plik: `setup() { return
useCardTab("problemy", {...}) }` + własny `template`.

**2. Karty „modularne"** (Przerwa techniczna, Projekty) — `.pcard` w
`przerwa.css`, logika w `modularTab.js` (`useModularTab(coll, opts)`) +
komponent `ModularCard.js`. Model: co najwyżej 2-wartościowy status
(`aktywne`/`oczekujace`, kolory czerwony/żółty — reużywają nazw klas CSS
`pilne`/`oczekujace` z systemu priorytetów wyłącznie jako identyfikatory
koloru, to NIE są priorytety) **albo brak statusu w ogóle** (Przerwa
techniczna — sterowane propem `hasStatus: false`, wszystkie karty szare).
Zamiast pojedynczego opisu: `updates` — chronologiczna lista (najnowszy na
górze), każdy update zawiera dowolną liczbę typowanych, przeciąganych
„elementów" (`opis` / `link` / `media` / `kontakt` / `cena`). Tryb
pełnoekranowy (`fullscreen` prop na `ModularCard`) to ten sam komponent,
tylko powiększony w overlayu — „wątek na forum". Karty modularne **nie**
uczestniczą w mechanizmie „Przenieś do" (inny kształt danych, niekompatybilny
z `CARD_COLLECTIONS`).

Obie rodziny współdzielą: `ContextMenu`, `MediaUpload`, drag-reorder przez
Sortable.js, wzorzec `store.patchCard` z debounce, archiwizację/usuwanie
przez te same generyczne endpointy backendu.

### Element „link" w kartach modularnych — rozpoznawanie URL vs ścieżka lokalna
`ModularCard.js` sprawdza `isWebUrl()` (regex na schemat `xxx://`): jeśli
treść to adres webowy → otwiera nową kartę przeglądarki; jeśli to lokalna
ścieżka (np. `P:\Zamówienia\...` albo `/mnt/dane/...`) → woła
`POST /api/open-path`, backend odpala natywnego eksploratora plików na
hoście. Przeglądarka nie może nawigować do `file://` z powodów
bezpieczeństwa, stąd ten backend round-trip.

### Menu kontekstowe (prawy klik / long-press) i natywny spellcheck — konflikt do pamiętania
`ContextMenu.js` (`useContextMenu()`) daje `bind()` zwracający handlery
`contextmenu`/`touchstart` z `preventDefault()` — **to blokuje natywne menu
przeglądarki** (w tym podpowiedzi pisowni) dla każdego elementu, do którego
jest podpięte. Dlatego w kartach modularnych `ctxBind` do usuwania elementu
jest podpięty **tylko pod ikonkę typu elementu** (`.pel__ico`), NIE pod cały
wiersz — pola tekstowe (`textarea`/`input` wewnątrz `.pel`) muszą zachować
natywne menu przeglądarki (kopiuj/wklej + spellcheck). Jeśli w przyszłości
dodajesz `ctxBind` do kolejnego elementu zawierającego pole tekstowe, pamiętaj
o tym rozdzieleniu.

### Spellcheck
Pola opisowe (`.karta__opis`, `.pel__txt` w kartach modularnych, `.card__inny`
w Raporcie) używają natywnego spellcheckera przeglądarki (nie ma własnego
słownika PL w tym projekcie — to byłby osobny, dużo większy feature).
Dyrektywa `v-spellfocus` (`app.js`) włącza `spellcheck` tylko gdy pole ma
focus i wyłącza po `blur`, żeby czerwone podkreślenia nie były widoczne przy
samym przeglądaniu kart. Ograniczanie fałszywych trafień na słowach
angielskich wymaga konfiguracji języków spellchecka w samej przeglądarce
użytkownika (`chrome://settings/languages`) — to poza kontrolą kodu appki.

### Globalne dyrektywy Vue (`app.js`)
- `v-skel` — shimmer na `<img>` do czasu załadowania.
- `v-autogrow="wartość"` — textarea rośnie z treścią; przelicza tylko gdy
  `binding.value` faktycznie się zmienił (inaczej niepowiązany re-render,
  np. otwarcie context menu na tej samej karcie, zerowałby scroll).
- `v-spellfocus` — spellcheck tylko przy aktywnym polu (patrz wyżej).
- `v-livemodel="wartość"` — zamiennik `:value` dla pól tekstowych, który nie
  nadpisuje pola aktualnie edytowanego (mającego focus). Rozwiązuje
  „znikający tekst"/skoki kursora przy echu zapisu z serwera.

Lokalna dyrektywa `v-sortable` (zdefiniowana wewnątrz `ModularCard.js`, nie
globalnie) obsługuje przeciąganie elementów **wewnątrz jednego update'u** —
osobna instancja Sortable.js per update, celowo nie globalna, bo to ściśle
wewnętrzny mechanizm tego komponentu.

### Motyw, zoom UI, ikony
- Dark/light theme przez `data-theme` na `<html>`, przełącznik w
  `UiControls` (`app.js`), zapis w `localStorage["dte-theme"]`. Zastosowanie
  motywu i zoomu dzieje się w inline `<script>` w `index.html` **przed**
  załadowaniem Vue, żeby uniknąć mignięcia złym motywem (FOUC).
- Zoom UI: CSS custom property `--ui-zoom` na `.app-shell` (zakres 60–150%,
  krok 10%), `localStorage["dte-zoom"]`. **Pułapka**: mieszanie
  `getBoundingClientRect()` (piksele po zoomie) z `scrollLeft`/`clientWidth`
  (piksele lokalne, nieskalowane) psuje pozycjonowanie proporcjonalnie do
  poziomu zoomu. Poprawny wzorzec: `offsetLeft`/`offsetWidth` wyłącznie
  (wymaga `position: relative` na kontenerze scrollującym, żeby był
  `offsetParent`). Przykład: `scrollAndFlash()` w `Raport.js`.
- Ikony: **tylko** wagi `regular` (`ph-*`) i `fill` (`ph-fill ph-*`) z
  Phosphor Icons są zwendorowane/załadowane — inne wagi (bold, duotone…)
  nie zadziałają, bo ich CSS/font nie jest wgrany.

## 3.6 Model danych — kluczowe kształty

```jsonc
// data/lokacje.json — hierarchia master-data (id jest stabilny, używany jako klucz)
[{ "id": "wystawa", "nazwa": "Wystawa", "pod_lokalizacje": [
  { "id": "akcja_czlowiek", "nazwa": "Akcja Człowiek", "kolor": "E58A0B",
    "eksponaty": ["Nazwa 1", "Nazwa 2", ...] }  // eksponaty to PROSTE STRINGI, nie obiekty
]}]

// karta "klasyczna" (problemy/zakupy/eksploatacja)
{ "id", "tytul", "archiwum": false, "createdAt",
  "priorytet": "pilne"|"oczekujace"|"przyszlosc",
  "lokalizacja": "wystawaId::nazwaEksponatu" | "podLokalizacjaId" | null,
  "opis": "", "zdjecia": ["/uploads/..."], "zdjeciaAlt": { "url": "alt tekst" },
  "komentarze": [{ "id", "autor": "warsztat"|"biuro", "tekst", "ts", "editedAt"?, "usunieta"? }] }

// karta "modularna" (przerwa/projekty)
{ "id", "tytul", "archiwum": false, "createdAt",
  "status": "aktywne"|"oczekujace",  // ignorowany w UI gdy hasStatus=false (Przerwa)
  "updates": [{ "id", "data": "ISO datetime", "elementy": [
    { "id", "typ": "opis"|"link"|"media"|"kontakt"|"cena",
      "tytul"?: string, "tresc"?: string, "urls"?: string[] }
  ]}] }  // updates: najnowszy PIERWSZY (unshift); elementy: kolejność = kolejność w tablicy

// arch/RRRR/MM/DD/raport.json — raport dnia
{ "date": "YYYY-MM-DD", "savedAt": "ISO", "eksponaty": {
  "wystawaId::nazwaEksponatu": {
    "stan": "ok"|"serwis"|"usterka"|"inne"|"poza",
    "status"?: "jeden z data/statusy.json wg kategorii stanu",
    "opis"?: string, "media"?: ["/uploads/raport/..."]
  }
}}
```

ID kart generuje backend (`uuid.uuid4().hex[:12]`). ID zagnieżdżonych
elementów kart modularnych (`updates[].id`, `elementy[].id`) generuje
**frontend** (`genId()` w `ModularCard.js`, timestamp+losowość base36) —
nigdy nie są zwracane/nadawane przez backend, backend traktuje `updates`
jako nieprzezroczysty blob i po prostu go zapisuje (`store.patchCard`
zawsze wysyła **całą** zagnieżdżoną strukturę `updates`, nie granularne diffy
— wzorzec „wyślij całość" spójny z resztą apki).

## 3.7 Konwencje kodu specyficzne dla tego repo

- **Cały kod, komentarze i UI po polsku.** Zachowuj tę konwencję —
  nie przełączaj się na angielski w nowych plikach/komentarzach.
- **Brak build stepu.** Nie dodawaj TypeScriptu, JSX, ani niczego wymagającego
  transpilacji — pliki `.js` muszą działać jako natywne ESM w przeglądarce
  bez zmian.
- **Wzorzec „cienki wrapper + współdzielony composable"**: gdy dwie zakładki
  mają być funkcjonalnie identyczne (Problemy/Zakupy/Eksploatacja;
  Przerwa/Projekty), logika idzie do `use*Tab(coll, opts)` w jednym pliku,
  a każda zakładka to mały plik z `setup() { return useXTab(coll, {...}) }`
  + własnym `template`. Nie kopiuj logiki między zakładkami.
- **Modularne rejestry**: nowe kolekcje kart dopisuje się w kilku miejscach
  jednocześnie — `main.py` (`COLLECTIONS` dict, ew. branch w `create_card`),
  `store.js` (state + `boot()` + WS channel guard), `app.js` (`TAB_GROUPS`),
  ew. `cardTab.js` `CARD_COLLECTIONS` (tylko jeśli kompatybilny kształt
  danych z kartami klasycznymi).
- **Debounce zapisów**: edycje tekstowe (opis, tytuł, komentarze) nie
  wysyłają requestu na każdy `keypress` — `store.patchCard` debounce'uje
  350ms per `coll:id`. Nie usuwaj tego wzorca przy okazji innych zmian.
- **Usuwanie miękkie vs twarde**: komentarze czatu i karty mają osobne
  ścieżki — miękkie (`archiwum`/`usunieta`, odwracalne z poziomu danych)
  i twarde (`/trwale`, kasuje też pliki). UI zawsze potwierdza (`confirm()`)
  przed twardym usunięciem.
- **Weryfikacja zmian frontendowych**: nie ma testów — po każdej
  nietrywialnej zmianie UI uruchom appkę i sprawdź w przeglądarce
  (headless Chromium + CDP działa dobrze do zautomatyzowanej weryfikacji
  w tym środowisku; pamiętaj o `run_in_background`/dedykowanym
  `--user-data-dir`, żeby proces przeżył pojedyncze wywołanie narzędzia i
  nie czytał cache'u z poprzednich sesji).

## 3.8 Wdrożenie produkcyjne

### Gdzie to działa

| | |
|---|---|
| Adres dla użytkowników | `http://172.18.10.7:8000` |
| Serwer | Ubuntu 24.04 LTS, hostname `DTE`, 4 vCPU / 2 GB RAM / 22 GB dysk |
| Adres IP | **statyczny** (wpisany w netplan, nie DHCP) |
| Katalog aplikacji | `/opt/DziennikDTE` |
| Dostęp administracyjny | SSH na `root@172.18.10.7` (klucz ed25519) |
| Firewall (ufw) | nieaktywny — appka jest w zaufanej sieci LAN, bez dostępu z internetu |

Aplikacja działa jako usługa systemd (`/etc/systemd/system/dte.service`):

```ini
[Service]
Environment=DTE_ADMIN_HASLO=<hasło do menu technicznego>
WorkingDirectory=/opt/DziennikDTE
Environment=DTE_PORT=8000
ExecStart=/opt/DziennikDTE/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3
```

`Restart=always` jest **wymagane**, nie kosmetyczne — na nim opiera się
mechanizm samo-restartu przy aktualizacji kodu (patrz niżej) oraz powrót po
awarii procesu. `enable`d, więc appka wstaje sama po restarcie maszyny.

Przydatne komendy:

```bash
systemctl status dte           # stan usługi
systemctl restart dte          # ręczny restart
journalctl -u dte -f           # logi na żywo
```

### Hasło administracyjne

Hasło do menu technicznego trzymane jest **wyłącznie** w linii
`Environment=DTE_ADMIN_HASLO=...` w pliku systemd na serwerze. Nie ma go w
repozytorium (repo jest publiczne) ani nigdzie w kodzie. Zmiana hasła:
edycja tej linii + `systemctl daemon-reload && systemctl restart dte`.

Bez tej zmiennej funkcje administracyjne są **całkowicie zablokowane** — to
celowy fail-safe, żeby świeża instalacja nie wystawiła ich domyślnie otwartych.

### Wydawanie nowej wersji

Docelowy obieg nie wymaga dostępu SSH — aktualizację może wykonać osoba w
CNE z poziomu przeglądarki:

1. Wypchnij zmiany na `main` w GitHubie (`git push`).
2. W aplikacji: klik w **logo** → hasło → **Aktualizuj kod**.
3. Backend robi `git pull --ff-only`, w razie zmian w `requirements.txt`
   doinstalowuje zależności, po czym kończy proces — systemd podnosi go z
   nowym kodem (kilka sekund przerwy). Klient sam czeka na nowy `bootId`
   i przeładowuje UI bez cache'u.

**Pułapka:** `--ff-only` odmówi, jeśli drzewo robocze na serwerze jest brudne
albo historia się rozjechała (np. ktoś edytował plik bezpośrednio na
serwerze). Wtedy trzeba wejść po SSH i posprzątać (`git status`,
`git checkout -- <plik>`). Dlatego **nie edytuj plików na serwerze ręcznie** —
wszystko przez repozytorium.

### Kopie zapasowe

Backup działa w trybie „pull" ze stacji roboczej — serwer nie ma żadnych
dodatkowych uprawnień ani kluczy.

| | |
|---|---|
| Skrypt | `~/dte-backups/backup.sh` (na stacji roboczej, nie w repo) |
| Harmonogram | cron, codziennie 3:00 |
| Co obejmuje | `data/`, `uploads/`, `arch/` z serwera |
| Gdzie ląduje | `~/dte-backups/snapshots/RRRR-MM-DD_HHMMSS/` |
| Retencja | 14 ostatnich migawek |
| Log | `~/dte-backups/backup.log` |

Migawki używają `rsync --link-dest`, więc niezmienione pliki są twardo
dowiązywane — kolejny dzień zajmuje miejsce tylko za to, co faktycznie się
zmieniło (pierwsza migawka ~87 MB, kolejne rzędu kilkuset kB).

**To jedyna kopia danych** — `data/`, `uploads/` i `arch/` są w `.gitignore`
i nigdy nie trafiają do repozytorium (są to prawdziwe dane robocze CNE, a
repo jest publiczne).

### Odtworzenie instalacji od zera

```bash
apt install python3.12-venv      # świeże Ubuntu Server tego nie ma, a venv bez tego nie wstanie
git clone https://github.com/RysDawid/DziennikDTE.git /opt/DziennikDTE
cd /opt/DziennikDTE && ./run.sh  # utworzy venv i zainstaluje zależności
```

Następnie: plik systemd jak wyżej (z hasłem), `systemctl enable --now dte`,
a na końcu dane — spakuj ostatnią migawkę backupu i wgraj przez
**logo → hasło → Import archiwum**:

```bash
cd ~/dte-backups/snapshots/latest && zip -r /tmp/archiwum.zip data uploads arch
```

Import przenosi dotychczasową zawartość do `_backup/<znacznik czasu>/` na
serwerze zamiast ją kasować, więc pomyłka jest odwracalna.

## 3.9 Słowniczek domenowy (PL → znaczenie)

| Termin | Znaczenie |
|---|---|
| CNE | Centrum Nauki (instytucja — właściciel/użytkownik tego narzędzia) |
| eksponat | pojedyncza interaktywna stacja/wystawka na wystawie |
| wystawa | ekspozycja (górny poziom hierarchii lokacji) |
| pod-lokalizacja | grupa/sala/strefa eksponatów w ramach wystawy |
| DTE | Dziennik Techniczno-Eksploatacyjny — nazwa całej aplikacji |
| Raport dzienny | codzienna inspekcja stanu wszystkich eksponatów |
| stan (eksponatu) | jeden z 5: sprawny / serwis / usterka / inne / poza (wystawą) |
| status | opcjonalny, predefiniowany podtyp stanu (np. „Naprawa mechaniczna") z `data/statusy.json` |
| priorytet | pilne / oczekujące / przyszłościowe — dla kart klasycznych |
| warsztat / biuro | dwie „role" autora wiadomości w czacie karty (nie system logowania — wybór ręczny przy wysyłce) |
| karta | pojedynczy wpis w Problemach/Zakupach/Eksploatacji/Przerwie/Projektach |
| archiwizacja | miękkie zamknięcie karty (`archiwum: true`), odwracalne |
| przerwa techniczna | krótkotrwałe zamknięcia/wyłączenia eksponatów (karta modularna, bez statusu) |
| update | wpis na osi czasu karty modularnej (jak post na forum) |
| element | typowany fragment treści update'u: opis/link/media/kontakt/cena |

---

## Licencja

[Unlicense](LICENSE) — domena publiczna, Dawid Ryś.
