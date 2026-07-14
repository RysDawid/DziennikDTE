// Korzeń aplikacji DTE: powłoka, pasek zakładek, logo + zegar, router zakładek.
import { createApp, computed, onMounted, onUnmounted, nextTick, watch, ref, h } from "vue";
import { store } from "./store.js";
import Raport from "./tabs/Raport.js";
import Problemy from "./tabs/Problemy.js";
import Eksploatacja from "./tabs/Eksploatacja.js";
import Zakupy from "./tabs/Zakupy.js";
import PrzerwaTechniczna from "./tabs/PrzerwaTechniczna.js";
import Projekty from "./tabs/Projekty.js";
import { PRIO } from "./tabs/cardTab.js";
import ImportArchiwum from "./components/ImportArchiwum.js";

// Zakładki pogrupowane wizualnie (większy odstęp MIĘDZY grupami, zakładki
// WEWNĄTRZ grupy stykają się jak dotychczas — styl "teczek"). Kolejność grup
// i zakładek w nich jest znacząca (patrz .tabbar w template niżej).
const TAB_GROUPS = [
  [{ id: "raport", label: "Raport dzienny", comp: Raport }],
  [
    { id: "problemy", label: "Problemy", comp: Problemy },
    { id: "zakupy", label: "Zakupy", comp: Zakupy },
    { id: "eksploatacja", label: "Eksploatacja", comp: Eksploatacja },
  ],
  [
    { id: "projekty", label: "Projekty", comp: Projekty },
    { id: "przerwa", label: "Przerwa techniczna", comp: PrzerwaTechniczna },
  ],
  [{ id: "archiwum", label: "Dashboard" }],
];
const TABS = TAB_GROUPS.flat();

const PLACEHOLDERS = {
  archiwum: {
    tag: "Moduł w przygotowaniu",
    title: "Dashboard",
    desc: "Tu będzie archiwum wszystkich działań oraz statystyki eksponatów.",
  },
};

// Zegar pod logo — zawsze rozciągnięty na DOKŁADNIE 100% szerokości logo (bez
// tego cyfry przy stałym font-size wypadały węższe/szersze niż logo, zależnie
// od szerokości okna: .brand ma szerokość % viewportu, więc jego pikselowa
// szerokość jest zmienna, a font-size — nie). NIE używamy transform:scaleX()
// — nierównomiernie zniekształca kształty cyfr (wygląda "ściśnięte"/krzywe).
// Zamiast tego dopasowujemy letter-spacing (odstęp międzyznakowy) tak, żeby
// całość sięgnęła dokładnie do szerokości logo — same cyfry zostają
// nietknięte, zmienia się tylko odstęp między nimi (typografia bez zniekształceń).
// Przelicz na: mount, zmianę tekstu (co minutę) i zmianę rozmiaru rodzica (okno/zoom UI).
const Clock = {
  setup() {
    const now = ref(new Date());
    const el = ref(null);
    let t, ro;
    const hhmm = computed(() => {
      const p = (n) => String(n).padStart(2, "0");
      return `${p(now.value.getHours())}:${p(now.value.getMinutes())}`;
    });
    function fitWidth() {
      const node = el.value;
      const parent = node?.parentElement;
      if (!node || !parent) return;
      const cs = getComputedStyle(parent);
      const target = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      node.style.letterSpacing = "0px";
      const natural = node.offsetWidth;
      // W tej implementacji przeglądarki letter-spacing dolicza się RAZ NA ZNAK
      // (także po ostatnim znaku, nie tylko "między" nimi) — dzielnik to długość
      // tekstu, nie liczba odstępów (potwierdzone empirycznie, patrz historia zmian).
      const chars = Math.max(1, (node.textContent || "").length);
      if (natural > 0 && target > 0) node.style.letterSpacing = `${(target - natural) / chars}px`;
    }
    onMounted(() => {
      t = setInterval(() => (now.value = new Date()), 1000);
      // Obserwuj RODZICA (.brand), nie samego siebie — fitWidth() tymczasowo
      // zmienia własną szerokość podczas pomiaru, więc obserwacja własnego
      // elementu ryzykowałaby pętlę zwrotną.
      ro = new ResizeObserver(fitWidth);
      if (el.value?.parentElement) ro.observe(el.value.parentElement);
      nextTick(fitWidth);
    });
    onUnmounted(() => { clearInterval(t); ro?.disconnect(); });
    watch(hhmm, () => nextTick(fitWidth));
    return () => h("div", { class: "brand__clock", ref: el }, hhmm.value);
  },
};

// Sterowanie UI: zoom (powiększ/pomniejsz) + przełącznik motywu jasny/ciemny.
// Preferencje per-urządzenie → localStorage. Zoom przez --ui-zoom (CSS zoom na .app-shell);
// teleport do body, by sam pasek nie skalował się razem z UI.
const UiControls = {
  components: { ImportArchiwum },
  setup() {
    const THEME_KEY = "dte-theme";
    const ZOOM_KEY = "dte-zoom";
    const ZOOM_MIN = 0.6, ZOOM_MAX = 1.5, ZOOM_STEP = 0.1;

    const importOpen = ref(false);

    const theme = ref(localStorage.getItem(THEME_KEY) || "dark");
    const z0 = parseFloat(localStorage.getItem(ZOOM_KEY));
    const zoom = ref(isNaN(z0) ? 1 : z0);

    const clampRound = (v) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100));

    function applyTheme() {
      document.documentElement.setAttribute("data-theme", theme.value);
      localStorage.setItem(THEME_KEY, theme.value);
    }
    function applyZoom() {
      document.documentElement.style.setProperty("--ui-zoom", String(zoom.value));
      localStorage.setItem(ZOOM_KEY, String(zoom.value));
    }
    function toggleTheme() {
      theme.value = theme.value === "dark" ? "light" : "dark";
      applyTheme();
    }
    function zoomIn() { zoom.value = clampRound(zoom.value + ZOOM_STEP); applyZoom(); }
    function zoomOut() { zoom.value = clampRound(zoom.value - ZOOM_STEP); applyZoom(); }
    function zoomReset() { zoom.value = 1; applyZoom(); }

    onMounted(() => { applyTheme(); applyZoom(); });

    const zoomPct = computed(() => Math.round(zoom.value * 100) + "%");

    return { theme, zoomPct, toggleTheme, zoomIn, zoomOut, zoomReset, importOpen };
  },
  template: `
    <Teleport to="body">
      <div class="uictl">
        <div class="uictl__group">
          <button class="uictl__btn" @click="zoomOut" title="Pomniejsz UI" aria-label="Pomniejsz UI"><i class="ph-fill ph-minus"></i></button>
          <button class="uictl__pct" @click="zoomReset" title="Resetuj rozmiar (100%)">{{ zoomPct }}</button>
          <button class="uictl__btn" @click="zoomIn" title="Powiększ UI" aria-label="Powiększ UI"><i class="ph-fill ph-plus"></i></button>
        </div>
        <button class="uictl__btn" @click="importOpen = true" title="Import archiwum (data/uploads/arch z zip)" aria-label="Import archiwum">
          <i class="ph-fill ph-database"></i>
        </button>
        <button class="uictl__btn uictl__theme" @click="toggleTheme"
                :title="theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny'"
                :aria-label="theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny'">
          <i :class="theme === 'dark' ? 'ph-fill ph-sun' : 'ph-fill ph-moon'"></i>
        </button>
      </div>
      <ImportArchiwum v-if="importOpen" @close="importOpen = false" />
    </Teleport>
  `,
};

// Placeholder dla zakładek jeszcze niezaimplementowanych — czyta store.activeTab reaktywnie,
// dzięki czemu jeden cached instance działa dla wszystkich placeholder-tabs.
const PlaceholderComp = {
  setup() { return { store, PLACEHOLDERS }; },
  template: `
    <section class="placeholder">
      <div class="placeholder__inner">
        <div class="placeholder__tag">{{ PLACEHOLDERS[store.activeTab]?.tag }}</div>
        <h2 class="placeholder__title">{{ PLACEHOLDERS[store.activeTab]?.title }}</h2>
        <p class="placeholder__desc">{{ PLACEHOLDERS[store.activeTab]?.desc }}</p>
      </div>
    </section>
  `,
};

const App = {
  components: { Clock, UiControls },
  setup() {
    // Liczniki priorytetów (pilne/oczekujące/przyszłościowe) na zakładkę — badge'e w tabbarze.
    function prioCounts(coll) {
      return PRIO.map((p) => ({
        v: p.v,
        n: store[coll].filter((c) => c.priorytet === p.v).length,
      })).filter((d) => d.n > 0);
    }
    const dotsProblemy = computed(() => prioCounts("problemy"));
    const dotsEksploatacja = computed(() => prioCounts("eksploatacja"));
    const dotsZakupy = computed(() => prioCounts("zakupy"));
    // Projekty ma inny (2-wartościowy) model statusu — v:"pilne" tu jest tylko nazwą
    // klasy CSS (czerwony kolor), nie priorytetem "pilne". Przerwa techniczna nie ma
    // statusów (wszystkie karty szare) — brak liczników.
    const dotsProjekty = computed(() => {
      const out = [];
      const aktywne = store.projekty.filter((c) => c.status === "aktywne").length;
      const oczekujace = store.projekty.filter((c) => c.status === "oczekujace").length;
      if (aktywne) out.push({ v: "pilne", n: aktywne });
      if (oczekujace) out.push({ v: "oczekujace", n: oczekujace });
      return out;
    });
    const dots = (id) =>
      id === "problemy" ? dotsProblemy.value
      : id === "eksploatacja" ? dotsEksploatacja.value
      : id === "zakupy" ? dotsZakupy.value
      : id === "projekty" ? dotsProjekty.value
      : [];

    // Zawsze zwraca komponent (nigdy null); placeholder-tabs dostają PlaceholderComp.
    const activeComp = computed(
      () => TABS.find((t) => t.id === store.activeTab)?.comp || PlaceholderComp
    );
    // Klucz tylko dla placeholder-tabs (ten sam PlaceholderComp obsługuje 3 zakładki).
    // Dla real-tabs: undefined = KeepAlive cache'uje po typie komponentu → brak re-mount.
    const compKey = computed(
      () => (activeComp.value === PlaceholderComp ? store.activeTab : undefined)
    );

    return { store, TAB_GROUPS, dots, activeComp, compKey };
  },
  template: `
    <Transition name="bootfade">
    <div v-if="!store.ready" key="boot" class="boot">
      <div class="boot__brand">
        <div class="boot__logo-wrap">
          <img class="boot__logo" src="/img/logo/logo.png" alt="DTE" />
        </div>
        <div class="boot__subtitle">Dziennik</div>
      </div>
      <div class="boot__loading">
        <div class="boot__bar-label">Wczytywanie bazy danych…</div>
        <div class="boot__bar"><div class="boot__bar-fill" :style="{ width: store.bootProgress + '%' }"></div></div>
        <div class="boot__pct">{{ Math.round(store.bootProgress) }}%</div>
      </div>
    </div>
    <div v-else key="app" class="app-shell">
      <UiControls />
      <div class="brand">
        <img class="brand__logo" src="/img/logo/logo.png" alt="DTE" />
        <Clock />
      </div>

      <div class="main-col">
        <nav class="tabbar">
          <div v-for="g in TAB_GROUPS" :key="g[0].id" class="tab-group">
            <button
              v-for="t in g" :key="t.id"
              class="tab" :class="{ 'is-active': store.activeTab === t.id }"
              @click="store.activeTab = t.id"
            >
              {{ t.label }}
              <span v-for="d in dots(t.id)" :key="d.v" class="tab__dot" :class="'tab__dot--' + d.v">{{ d.n }}</span>
            </button>
          </div>
        </nav>

        <main class="workspace">
          <!-- Bez przejścia out-in: nowa zakładka pojawia się natychmiast (dane są w store,
               KeepAlive cache'uje) → brak migotania pustego tła między zakładkami. -->
          <KeepAlive>
            <component :is="activeComp" :key="compKey" />
          </KeepAlive>
        </main>
      </div>
    </div>
    </Transition>
  `,
};

const app = createApp(App);

// v-skel: skeleton-shimmer na <img> aż do załadowania (puste tło → animowany gradient).
app.directive("skel", {
  mounted(el) {
    if (el.tagName !== "IMG") return;
    const done = () => { el.classList.remove("skel-img"); el.classList.add("skel-img--done"); };
    const fail = () => el.classList.remove("skel-img");
    if (el.complete && el.naturalWidth) return done(); // z cache — już gotowe
    el.classList.add("skel-img");
    el.addEventListener("load", done, { once: true });
    el.addEventListener("error", fail, { once: true });
  },
  updated(el, binding) {
    // zmiana src (np. po edycji zdjęcia) → pokaż skeleton ponownie
    if (el.tagName !== "IMG" || binding.value === binding.oldValue) return;
    if (!(el.complete && el.naturalWidth)) {
      el.classList.add("skel-img");
      el.classList.remove("skel-img--done");
      el.addEventListener("load", () => { el.classList.remove("skel-img"); el.classList.add("skel-img--done"); }, { once: true });
    }
  },
});

// v-autogrow="wartość": <textarea> rośnie w wysokości wraz z treścią (szerokość zawsze 100% —
// CSS min-/max-height dalej ograniczają zakres, powyżej max włącza się natywny scroll).
// Przelicza wysokość TYLKO gdy powiązana wartość faktycznie się zmieniła — inaczej
// przerenderowanie z niepowiązanego powodu (np. otwarcie context menu na czacie tej samej
// karty) wywołałoby zbędny reflow i zerowało scroll przewiniętego .karta__body.
function autogrow(el) {
  if (el.tagName !== "TEXTAREA") return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
app.directive("autogrow", {
  mounted: (el) => autogrow(el),
  updated: (el, binding) => { if (binding.value !== binding.oldValue) autogrow(el); },
});

// v-livemodel="wartość": zamiennik :value dla pól tekstowych, który NIE nadpisuje
// zawartości pola, które użytkownik właśnie edytuje (ma focus). Rozwiązuje problem
// „znikającego tekstu" i skoków kursora: podczas pisania przychodzi echo zapisu z
// serwera (WS „update" → Object.assign całej karty) albo pole przerenderowuje się po
// optymistycznym zapisie — bez tej blokady DOM byłby wtedy nadpisywany nieaktualną
// wartością sprzed sekundy i kasował świeżo wpisane znaki. Gdy pole ma focus,
// zewnętrzne zmiany modelu są ignorowane (DOM = źródło prawdy); po blurze pole
// synchronizuje się z modelem. Działa na wszystkich przeglądarkach (Firefox też).
app.directive("livemodel", {
  // 'created' (a nie 'mounted'): wartość musi trafić do pola ZANIM zadziała mounted
  // innych dyrektyw — w szczególności v-autogrow, który liczy wysokość ze scrollHeight
  // i musi widzieć już wpisaną treść (created zawsze poprzedza mounted każdego elementu).
  created(el, binding) {
    el.value = binding.value == null ? "" : binding.value;
  },
  updated(el, binding) {
    if (document.activeElement === el) return; // edytowane → nie ruszaj (blokada pola)
    const v = binding.value == null ? "" : binding.value;
    if (el.value !== v) el.value = v;
  },
});

// v-spellfocus: podkreślenia pisowni widoczne TYLKO gdy pole jest aktywnie edytowane
// (ma focus) — czysto wizualnie, żeby czerwone linie nie rzucały się w oczy przy
// samym przeglądaniu kart. Przełączanie atrybutu spellcheck wymusza w przeglądarce
// natychmiastowe pojawienie się/zniknięcie podkreśleń.
app.directive("spellfocus", {
  mounted(el) {
    el.spellcheck = false;
    el.addEventListener("focus", () => { el.spellcheck = true; });
    el.addEventListener("blur", () => { el.spellcheck = false; });
  },
});

app.mount("#app");
store.boot().catch((e) => {
  console.error(e);
  document.getElementById("app").innerHTML =
    '<div class="boot">Błąd połączenia z serwerem — sprawdź, czy backend działa.</div>';
});
