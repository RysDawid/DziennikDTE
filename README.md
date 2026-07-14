# DTE — Dziennik Techniczno-Eksploatacyjny (CNE)

Ten dokument to techniczny kontekst dla LLM/agenta podejmującego pracę nad tym
projektem. Zakłada zero wcześniejszej wiedzy o kodzie, ale nie tłumaczy
podstaw FastAPI/Vue — skupia się na tym, co jest specyficzne dla tego
repozytorium: strukturę, konwencje, pułapki i domenę.

## ⚠️ Zanim cokolwiek zmienisz

- **To jest żywe narzędzie produkcyjne**, używane codziennie przez personel
  centrum nauki (CNE). `data/*.json` i `uploads/` to prawdziwe dane
  użytkowników (zgłoszenia usterek, zamówienia, projekty, raporty dzienne) —
  nie dane testowe.
- **Brak repozytorium Git.** Nie ma historii, `git blame`, ani łatwego
  cofnięcia zmiany. Edycja pliku = trwała zmiana od razu. Bądź ostrożny przy
  edycjach hurtowych/`sed`; preferuj precyzyjne, pojedyncze zmiany.
- **Brak testów automatycznych.** Jedyna weryfikacja to ręczne uruchomienie
  aplikacji (patrz `run.sh`/`run.bat`) i sprawdzenie w przeglądarce
  (np. headless Chromium + CDP) lub ręczna inspekcja plików JSON.
- **Katalog projektu jest w Dropboxie** (`.../Dropbox/.../System DTE`).
  Zmiany w plikach synchronizują się automatycznie na inne komputery. Pliki
  binarne (obrazy) mają w Dropboxie historię wersji — pliki JSON praktycznie
  nie (nadpisywane atomowo, patrz `save_json`).
- **Brak autoryzacji/logowania.** Każdy w sieci LAN, kto ma URL, może
  wszystko — w tym trwale usuwać karty (`DELETE .../trwale`). Traktuj to jak
  zaufane, pojedyncze stanowisko/sieć wewnętrzną, nie jak wielodostępny
  serwis publiczny.
- **Nigdy nie testuj destrukcyjnych operacji (usuwanie/archiwizacja) na
  nieznanych danych.** Przed jakimkolwiek `deleteCard`/`archiveCard` w
  testach zweryfikuj dokładne ID i tytuł karty (odczyt z `data/*.json`), i
  preferuj archiwizację (odwracalną) nad trwałym usunięciem do sprzątania
  po sobie. Utworzone przez siebie karty testowe usuwaj przez właściwe
  REST API (`DELETE /api/{coll}/{id}/trwale`), nie przez ręczną edycję JSON
  na dysku — backend trzyma kolekcje w pamięci procesu i nadpisze ręczną
  zmianę przy najbliższym zapisie.

## Co to za aplikacja

CNE to centrum nauki (interaktywne wystawy/eksponaty dla zwiedzających).
DTE to wewnętrzne narzędzie personelu technicznego do:

1. **Raportu dziennego** — codziennej inspekcji stanu każdego eksponatu na
   wystawie (sprawny / w serwisie / usterka / inne / wyłączony z wystawy),
   z opisem i zdjęciami, archiwizowane per dzień.
2. **Zgłaszania i śledzenia problemów** technicznych, zamówień/zakupów
   części, oraz odrębnej listy "Eksploatacja" (funkcjonalnie kopia
   Problemów) — każde jako karty z priorytetem, opisem, zdjęciami i wątkiem
   czatu (workshop ↔ office).
3. **Przerw technicznych** i **Projektów** — bardziej dynamiczny typ karty:
   oś czasu "update'ów" ze swobodnie dodawanymi elementami (opis / link /
   media / kontakt / cena), tryb pełnoekranowy przypominający wątek na
   forum.

Interfejs jest **w całości po polsku** — nazwy zmiennych, komentarze w
kodzie, teksty UI, dane domenowe. Słowniczek pojęć niżej.

## Stos technologiczny

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

## Uruchomienie

```bash
./run.sh            # domyślnie port 8000, host 0.0.0.0 (widoczny w LAN)
./run.sh 8080        # inny port
HOST=127.0.0.1 ./run.sh   # tylko lokalnie
```

`run.sh`/`run.bat` same tworzą `.venv`, instalują `requirements.txt` (tylko
gdy hash się zmienił) i odpalają `uvicorn main:app --host $HOST --port $PORT`.
Backend przy starcie wypisuje adresy LAN, pod którymi inne stanowiska mogą
się podłączyć (przeglądarka, bez instalacji niczego).

`run.bat` na Windows nie wymaga wcześniej zainstalowanego Pythona: jeśli go
nie znajdzie na PATH, sam pobiera oficjalny przenośny pakiet "embeddable"
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

## Struktura katalogów

```
main.py                    Cały backend (jeden plik, ~700 linii)
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
    utils.js                  fuzzy(), formatowanie dat, chatTime(), asColor()
    tabs/                     Jeden plik = jedna zakładka górnego paska
      Raport.js                Raport dzienny (największy plik, ~800 linii)
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
  css/
    main.css                    Tokeny (kolory/spacing/cienie), reset, layout appki
    components.css               Style komponentów współdzielonych (menu, upload, modal…)
    karty.css                    Style kart "klasycznych" (.karta, .cardtab__bar, .krow…)
    przerwa.css                  Style kart "modularnych" (.pcard, .pupd, .pel…)
    raport.css                    Style zakładki Raport dzienny
    inter.css                    @font-face dla lokalnie zwendorowanego fontu Inter
  vendor/                       Zwendorowane zależności (Vue/Sortable/Fuse/Phosphor/Inter)

design/                       Zrzuty ekranu/mockupy referencyjne (nieużywane w runtime)
```

## Backend (`main.py`) — mapa API

Jeden plik, bez routerów/blueprintów. Stan kolekcji trzymany jest **w
pamięci procesu** (listy `dict` załadowane raz przy starcie z `load_json`) i
zapisywany na dysk po każdej mutacji (`save_json`, atomowo). **Restart
procesu = przeładowanie z dysku** — więc jeśli coś edytujesz ręcznie w
`data/*.json` podczas gdy serwer działa, twoja zmiana zostanie nadpisana
przy najbliższym zapisie z pamięci, chyba że wcześniej zrestartujesz serwer.

### Dane referencyjne (read-mostly)
- `GET /api/bootstrap` — lokacje + statusy + dzisiejsza data, ładowane raz przy starcie klienta.
- `GET /api/lokacje`, `GET /api/statusy`
- `PATCH /api/eksponat/foto`, `PATCH /api/eksponat/nazwa` — edycja master-data eksponatu; rozsyłane przez WS (`channel: "lokacje"`) do wszystkich klientów jako "hot reload" bez restartu.

### Raport dzienny
- `GET /api/raport/{YYYY-MM-DD}` — dla dzisiejszej daty bez istniejącego pliku: zasiewa stan z `_previous_states()` (ostatni zapisany rekord per eksponat). Starsze daty: read-only (`editable: false`).
- `PUT /api/raport/{YYYY-MM-DD}` — tylko dla dzisiejszej daty (403 dla innych), nadpisuje cały plik dnia.
- `GET /api/raport-historia?przed=YYYY-MM-DD&limit=60` — lista dni do osi czasu historii.

### Karty — generyczne endpointy pod `/api/{name}`
`name` ∈ `COLLECTIONS` dict: `problemy | zakupy | eksploatacja | przerwa | projekty`.
Dodanie nowej kolekcji kartowej = dopisanie jej do `COLLECTIONS` (+ ew. do
`create_card`, jeśli ma inny kształt niż domyślny "klasyczny").

- `GET /api/{name}` — tylko niearchiwalne.
- `POST /api/{name}` — tworzy kartę. Kształt zależy od `name`: `przerwa`/`projekty` dostają `{status, updates: []}`, reszta dostaje `{priorytet, lokalizacja, opis, zdjecia: [], komentarze: []}`.
- `PATCH /api/{name}/{id}` — częściowa aktualizacja (allowlist pól: `tytul, priorytet, lokalizacja, opis, zdjecia, zdjeciaAlt, status, updates`).
- `POST /api/{name}/{id}/komentarz`, `PATCH .../komentarz/{msgId}`, `DELETE .../komentarz/{msgId}` — czat karty klasycznej (usuwanie miękkie: treść czyszczona, `usunieta: true`).
- `POST /api/{name}/reorder` — nowa kolejność wg listy ID.
- `DELETE /api/{name}/{id}` — **archiwizacja** (miękkie, `archiwum: true`).
- `DELETE /api/{name}/{id}/trwale` — **twarde usunięcie** (nieodwracalne, kasuje też katalog `uploads/{name}/{id}`).
- `POST /api/{name}/{id}/przenies` — przenosi kartę do innej kolekcji razem z uploadami (przemapowuje URL-e zdjęć).

### Inne
- `POST /api/upload/{kontekst}/{owner_id}` — multipart upload, zapisuje do `uploads/{kontekst}/{owner_id}/`, zwraca listę URL-i.
- `POST /api/open-path` — **musi być zarejestrowany PRZED `/api/{name}`** (patrz pułapka niżej). Otwiera lokalną ścieżkę (folder/plik) w natywnym eksploratorze plików hosta (`os.startfile` na Windows, `open` na macOS, `xdg-open` na Linuksie). Używane przez element "link" w kartach modularnych, gdy treść nie jest adresem `http(s)://`.
- `WS /ws` — jeden kanał dla wszystkich zdarzeń. Wiadomość: `{channel, action, payload}`. `channel` = nazwa kolekcji (`problemy`/`raport`/`lokacje`/…), `action` ∈ `create|update|comment|comment-edit|archive|delete|reorder`. Broadcast do **wszystkich** podłączonych klientów (w tym nadawcy — klient sam sobie też odbiera własne zmiany, `store.js` ma idempotentne guardy typu `if (!list.some(c => c.id === payload.id))`).

### ⚠️ Pułapka: kolejność rejestracji tras FastAPI
`@app.post("/api/{name}")` (tworzenie karty) jest **catch-all** dla
jednosegmentowych ścieżek pod `/api/`. Każdy nowy endpoint literalny typu
`/api/cokolwiek` (jeden segment po `/api/`) musi być zdefiniowany **przed**
tym catch-allem w kolejności w pliku, inaczej trafi tam jako `{name}` i np.
POST zamiast otworzyć folder utworzy nową "kartę" w nieistniejącej kolekcji
(404 "Nieznana kolekcja"). Endpointy dwusegmentowe (`/api/upload/{a}/{b}`)
nie kolidują. Ten błąd już raz się zdarzył przy dodawaniu `/api/open-path`
— patrz komentarz w `main.py` nad tym endpointem.

## Frontend — architektura

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
tablicy `TABS` w `app.js` (`{id, label, comp}`); zakładki bez `comp` dostają
generyczny `PlaceholderComp` ("moduł w przygotowaniu").

### Dwa systemy kart — nie mylić
To jest **najważniejsza rzecz do zrozumienia** we frontendzie, bo są dwie
równoległe, nieudostępniające sobie kodu implementacje "karty":

**1. Karty "klasyczne"** (Problemy, Zakupy, Eksploatacja) — `.karta` w
`karty.css`, logika w `cardTab.js` (`useCardTab(coll, opts)`). Model: 3-stopniowy
priorytet (`pilne/oczekujace/przyszlosc`), pojedynczy `opis` (textarea),
`zdjecia` (galeria + lightbox), `komentarze` (wątek czatu z dwoma
"autorami": `warsztat`/`biuro`, edycja/usuwanie miękkie). Karty da się
przenosić między tymi trzema kolekcjami (`CARD_COLLECTIONS` w `cardTab.js` —
dopisanie tam nowej kolekcji automatycznie włącza ją jako cel "Przenieś do"
we wszystkich trzech zakładkach, stąd komentarz "modularnie" w kodzie).
Każda zakładka (`Problemy.js` itd.) to cienki plik: `setup() { return
useCardTab("problemy", {...}) }` + własny `template`.

**2. Karty "modularne"** (Przerwa techniczna, Projekty) — `.pcard` w
`przerwa.css`, logika w `modularTab.js` (`useModularTab(coll, opts)`) +
komponent `ModularCard.js`. Model: co najwyżej 2-wartościowy status
(`aktywne`/`oczekujace`, kolory czerwony/żółty — reużywają nazw klas CSS
`pilne`/`oczekujace` z systemu priorytetów wyłącznie jako identyfikatory
koloru, to NIE są priorytety) **albo brak statusu w ogóle** (Przerwa
techniczna — sterowane propem `hasStatus: false`, wszystkie karty szare).
Zamiast pojedynczego opisu: `updates` — chronologiczna lista (najnowszy na
górze), każdy update zawiera dowolną liczbę typowanych, przeciąganych
"elementów" (`opis` / `link` / `media` / `kontakt` / `cena`). Tryb
pełnoekranowy (`fullscreen` prop na `ModularCard`) to ten sam komponent,
tylko powiększony w overlayu — "wątek na forum". Karty modularne **nie**
uczestniczą w mechanizmie "Przenieś do" (inny kształt danych, niekompatybilny
z `CARD_COLLECTIONS`).

Obie rodziny współdzielą: `ContextMenu`, `MediaUpload`, drag-reorder przez
Sortable.js, wzorzec `store.patchCard` z debounce, archiwizację/usuwanie
przez te same generyczne endpointy backendu.

### Element "link" w kartach modularnych — rozpoznawanie URL vs ścieżka lokalna
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

## Model danych — kluczowe kształty

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
    { "id", "typ": "opis"|"link"|"media"|"kontakt"|"cena", "tresc"?: string, "urls"?: string[] }
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
— wzorzec "wyślij całość" spójny z resztą apki).

## Słowniczek domenowy (PL → znaczenie)

| Termin | Znaczenie |
|---|---|
| CNE | Centrum Nauki (instytucja — właściciel/użytkownik tego narzędzia) |
| eksponat | pojedyncza interaktywna stacja/wystawka na wystawie |
| wystawa | ekspozycja (górny poziom hierarchii lokacji) |
| pod-lokalizacja | grupa/sala/strefa eksponatów w ramach wystawy |
| DTE | Dziennik Techniczno-Eksploatacyjny — nazwa całej aplikacji |
| Raport dzienny | codzienna inspekcja stanu wszystkich eksponatów |
| stan (eksponatu) | jeden z 5: sprawny / serwis / usterka / inne / poza (wystawą) |
| status | opcjonalny, predefiniowany podtyp stanu (np. "Naprawa mechaniczna") z `data/statusy.json` |
| priorytet | pilne / oczekujące / przyszłościowe — dla kart klasycznych |
| warsztat / biuro | dwie "role" autora wiadomości w czacie karty (nie system logowania — wybór ręczny przy wysyłce) |
| karta | pojedynczy wpis w Problemach/Zakupach/Eksploatacji/Przerwie/Projektach |
| archiwizacja | miękkie zamknięcie karty (`archiwum: true`), odwracalne |
| przerwa techniczna | krótkotrwałe zamknięcia/wyłączenia eksponatów (karta modularna, bez statusu) |
| update | wpis na osi czasu karty modularnej (jak post na forum) |
| element | typowany fragment treści update'u: opis/link/media/kontakt/cena |

## Konwencje kodu specyficzne dla tego repo

- **Cały kod, komentarze i UI po polsku.** Zachowuj tę konwencję —
  nie przełączaj się na angielski w nowych plikach/komentarzach.
- **Brak build stepu.** Nie dodawaj TypeScriptu, JSX, ani niczego wymagającego
  transpilacji — pliki `.js` muszą działać jako natywne ESM w przeglądarce
  bez zmian.
- **Wzorzec "cienki wrapper + współdzielony composable"**: gdy dwie zakładki
  mają być funkcjonalnie identyczne (Problemy/Zakupy/Eksploatacja;
  Przerwa/Projekty), logika idzie do `use*Tab(coll, opts)` w jednym pliku,
  a każda zakładka to mały plik z `setup() { return useXTab(coll, {...}) }`
  + własnym `template`. Nie kopiuj logiki między zakładkami.
- **Modularne rejestry**: nowe kolekcje kart dopisuje się w kilku miejscach
  jednocześnie — `main.py` (`COLLECTIONS` dict, ew. branch w `create_card`),
  `store.js` (state + `boot()` + WS channel guard), `app.js` (`TABS`),
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
