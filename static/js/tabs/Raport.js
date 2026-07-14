// TAB 1 — Raport. Nawigator dzienny + karty eksponatów (autosave, realtime).
import { ref, computed, watch, nextTick } from "vue";
import { store } from "../store.js";
import { dayParts, shiftDay, asColor, fuzzy } from "../utils.js";
import FuzzySelect from "../components/FuzzySelect.js";
import MediaUpload from "../components/MediaUpload.js";
import ImageModal from "../components/ImageModal.js";
import ContextMenu, { useContextMenu } from "../components/ContextMenu.js";

export default {
  components: { FuzzySelect, MediaUpload, ImageModal, ContextMenu },
  setup() {
    const mediaCard = ref(null);
    const lightbox = ref(null); // { images:[url], start, key } — key=null dla zdjęcia eksponatu
    const activeWystawa = ref(null);
    const activeStan = ref(null); // null = wszystkie stany (filtr nieaktywny); 'ok'|'serwis'|'usterka'|'inne'|'poza' = tylko ten stan
    const view = ref("full"); // 'full' = pełne karty | 'spis' = spis eksponatów (grupy) | 'history' = oś czasu statusów
    const stripEl = ref(null);
    const navEl = ref(null); // ref na <ul> daynav — do scrollIntoView

    const isToday = computed(() => store.raportDate === store.today);
    const isFuture = computed(() => store.raportDate > store.today);
    const isArchive = computed(() => store.raportDate < store.today);

    // Pełna lista dat: 3 dni w przód + dziś + 365 dni wstecz — bez limitu przeglądania archiwum.
    // Generowana raz (store.today się nie zmienia w trakcie sesji).
    const days = computed(() => {
      const out = [];
      for (let n = 0; n >= -365; n--) {
        const iso = shiftDay(store.today, n);
        out.push({ ...dayParts(iso), isToday: n === 0 });
      }
      return out;
    });

    const wystawy = computed(() => {
      const w = store.lokacje.find((l) => l.id === "wystawa");
      return w ? w.pod_lokalizacje : [];
    });
    if (!activeWystawa.value && wystawy.value.length) activeWystawa.value = wystawy.value[0].id;

    // Płaska lista kart (wszystkie wystawy, ciągły scroll przez granice)
    const cards = computed(() => {
      const out = [];
      let lastW = null;
      for (const w of wystawy.value) {
        for (const e of w.eksponaty) {
          out.push({
            key: `${w.id}::${e.nazwa}`,
            wystawa: w,
            nazwa: e.nazwa,
            img: e.img,
            color: asColor(w.kolor),
            firstInGroup: w.id !== lastW, // pierwszy eksponat wystawy → separator w historii
          });
          lastW = w.id;
        }
      }
      return out;
    });

    const visibleCards = computed(() =>
      activeStan.value
        ? cards.value.filter((c) => rec(c.key).stan === activeStan.value)
        : cards.value
    );
    function toggleStan(v) {
      activeStan.value = activeStan.value === v ? null : v;
    }

    const spisGrupy = computed(() => {
      const out = [];
      for (const w of wystawy.value) {
        const wCards = visibleCards.value.filter((c) => c.wystawa.id === w.id);
        if (wCards.length) out.push({ id: w.id, nazwa: w.nazwa, color: asColor(w.kolor), cards: wCards });
      }
      return out;
    });

    function rec(key) {
      return store.eksponatRec(key);
    }
    // Lista predefiniowanych statusów dla danego stanu (serwis/usterka/inne)
    // + uniwersalna opcja "Inny status" na końcu każdego zestawu.
    function statusOptions(stan) {
      return [
        ...(store.statusy[stan] || []).map((s) => ({ value: s, label: s })),
        { value: "Inny status", label: "Inny status" },
      ];
    }
    function setStan(key, val) {
      if (!store.raport.editable) return;
      const r = rec(key);
      if (r.stan === val) return; // bez zmian
      r.stan = val;
      // Zmiana stanu resetuje wybrany status i opis (inna grupa / brak dropdownu).
      r.status = "";
      r.opis = "";
      store.saveRaport();
    }
    function setStatus(key, val) {
      if (!store.raport.editable) return;
      rec(key).status = val;
      store.saveRaport();
    }
    function setOpis(key, val) {
      if (!store.raport.editable) return;
      rec(key).opis = val;
      store.saveRaport();
    }

    // --- Lightbox / galeria mediów ------------------------------------ //
    function openLightbox(images, start, key = null) {
      if (!images || !images.length) return;
      lightbox.value = { images, start, key };
    }
    // Z kluczem (media dnia): czytane na żywo z rec(key).media, nie zamrożone
    // w momencie otwarcia — inaczej usunięcie zdjęcia nie odświeżyłoby widoku
    // w otwartym lightboxie. Bez klucza (zdjęcie eksponatu, zawsze nieedytowalne):
    // zwracamy przekazaną tablicę wprost.
    const lightboxImages = computed(() => {
      const k = lightbox.value?.key;
      return k ? rec(k).media || [] : lightbox.value?.images || [];
    });
    const lightboxAlts = computed(() => {
      const k = lightbox.value?.key;
      return k ? rec(k).mediaAlt || {} : {};
    });
    const lightboxEditable = computed(
      () => !!lightbox.value?.key && store.raport.editable
    );
    function onLightboxAlt({ url, alt }) {
      const k = lightbox.value?.key;
      if (!k || !store.raport.editable) return;
      const r = rec(k);
      if (!r.mediaAlt) r.mediaAlt = {};
      r.mediaAlt[url] = alt;
      store.saveRaport();
    }
    // Trwałe usunięcie zdjęcia z galerii dnia (menu w lightboxie) — zamyka
    // lightbox, gdy to było ostatnie zdjęcie.
    function onLightboxDelete(url) {
      const k = lightbox.value?.key;
      if (!k || !store.raport.editable) return;
      const r = rec(k);
      r.media = (r.media || []).filter((u) => u !== url);
      if (r.mediaAlt) delete r.mediaAlt[url];
      store.saveRaport();
      if (!r.media.length) lightbox.value = null;
    }

    function focusWystawa(id) {
      activeWystawa.value = id;
      const strip = stripEl.value;
      const el = strip?.querySelector(`[data-grp="${id}"]`);
      if (!strip || !el) return;
      // offsetLeft (nie getBoundingClientRect) — odporne na zoom UI, patrz scrollAndFlash.
      strip.scrollTo({ left: el.offsetLeft, behavior: "smooth" });
    }

    function syncActiveWystawa() {
      const strip = stripEl.value;
      if (!strip || view.value === "spis") return; // pasy poziome: full + history
      const stripLeft = strip.getBoundingClientRect().left;
      // Pierwsza karta/kolumna której prawa krawędź wychodzi poza lewy brzeg paska
      // wyznacza aktywną wystawę.
      for (const el of strip.querySelectorAll("[data-grp]")) {
        if (el.getBoundingClientRect().right > stripLeft + 24) {
          const id = el.dataset.grp;
          if (id !== activeWystawa.value) activeWystawa.value = id;
          return;
        }
      }
    }
    function onWheel(e) {
      const strip = stripEl.value;
      if (!strip) return;
      if (view.value === "spis") return; // tryb "Spis Eksponatów": natywny scroll pionowy listy
      // Historia + Ctrl: przewijaj oś dni w pionie (i blokuj zoom przeglądarki).
      if (view.value === "history" && e.ctrlKey) {
        strip.scrollTop += e.deltaY;
        e.preventDefault();
        return;
      }
      // full + history (bez Ctrl): pionowe kółko → poziomy przesuw pasa.
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      strip.scrollLeft += delta;
      e.preventDefault();
    }

    // Historia: ładuj dni wcześniejsze niż oglądany dzień; odśwież przy zmianie dnia.
    const histoDate = (iso) => dayParts(iso).dmy;
    watch([view, () => store.raportDate], () => {
      if (view.value === "history") store.loadHistoria(store.raportDate);
    });
    // Wiersze osi czasu: 1. oglądany dzień (na żywo ze store.raport), dalej zapisana historia.
    const historiaRows = computed(() => {
      const liveStany = {};
      for (const [k, r] of Object.entries(store.raport.eksponaty || {})) {
        if (r && r.stan) liveStany[k] = r.stan;
      }
      return [{ date: store.raportDate, stany: liveStany }, ...store.raportHistoria.dni];
    });

    function openMedia(card) {
      if (!store.raport.editable) return;
      mediaCard.value = card;
    }
    function onMediaUploaded(card, urls) {
      const r = rec(card.key);
      r.media = [...(r.media || []), ...urls];
      store.saveRaport();
      mediaCard.value = null;
    }

    // Prosty, jednoznaczny zapis statusu eksponatu (bez tworzenia zamówienia/zakupu).
    // Dane i tak zapisują się automatycznie (debounced saveRaport() przy każdej zmianie
    // pola) — ten przycisk wymusza natychmiastowy zapis i pokazuje krótkie potwierdzenie
    // "Zapisano", żeby użytkownik miał pewność, że nic nie czeka w kolejce.
    const savedKey = ref(null);
    let savedTimer = null;
    async function zapiszStatus(card) {
      await store.saveRaportNow();
      savedKey.value = card.key;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        if (savedKey.value === card.key) savedKey.value = null;
      }, 1400);
    }

    // --- Globalna edycja eksponatu (menu kontekstowe) ----------------- //
    // Edycja master-data (zdjęcie / nazwa) — niezależna od dnia raportu.
    const ctxMenu = useContextMenu();
    const fotoCard = ref(null);      // karta z otwartym modalem zdjęcia
    const editTitleKey = ref(null);  // klucz eksponatu w trakcie edycji tytułu
    const editTitleVal = ref("");
    const ownerKey = (c) => "eksp_" + c.key.replace(/[^A-Za-z0-9]+/g, "_");

    function fotoItems(c) {
      const items = [
        { label: c.img ? "Zmień zdjęcie" : "Dodaj zdjęcie", icon: "ph-fill ph-camera",
          action: () => (fotoCard.value = c) },
      ];
      if (c.img) items.push({ label: "Usuń zdjęcie", icon: "ph-fill ph-trash", danger: true,
        action: () => store.setEksponatFoto(c.nazwa, null) });
      return items;
    }
    function titleItems(c) {
      return [{ label: "Edytuj tytuł", icon: "ph-fill ph-pencil-simple", action: () => startEditTitle(c) }];
    }
    function onFotoUploaded(card, urls) {
      if (urls?.length) store.setEksponatFoto(card.nazwa, urls[0]);
      fotoCard.value = null;
    }
    function startEditTitle(c) {
      editTitleKey.value = c.key;
      editTitleVal.value = c.nazwa;
      nextTick(() => {
        const el = stripEl.value?.querySelector(`[data-key="${c.key}"] .card__title-edit`);
        el?.focus();
        el?.select();
      });
    }
    function commitTitle(c) {
      const nowa = editTitleVal.value.trim();
      editTitleKey.value = null;
      if (nowa && nowa !== c.nazwa) store.renameEksponat(c.wystawa.id, c.nazwa, nowa);
    }
    function cancelTitle() { editTitleKey.value = null; }

    // 5 stanów. hasStatus = stan z dropdownem predefiniowanych statusów.
    const STANY = [
      { v: "ok",      label: "Sprawne działanie",   short: "Sprawne", color: "var(--stan-ok)",      hasStatus: false },
      { v: "serwis",  label: "Serwis",              short: "Serwis",  color: "var(--stan-serwis)",  hasStatus: true  },
      { v: "usterka", label: "Usterka / Wyłączony", short: "Usterka", color: "var(--stan-usterka)", hasStatus: true  },
      { v: "inne",    label: "Inne",                short: "Inne",    color: "var(--stan-inne)",    hasStatus: true  },
      { v: "poza",    label: "Wyłączony z wystawy", short: "Poza",    color: "var(--stan-poza)",    hasStatus: false },
    ];
    const stanDef = (v) => STANY.find((s) => s.v === v) || null;

    const searchQuery = ref("");
    const searchOpen = ref(false);

    const searchHits = computed(() => {
      const q = searchQuery.value.trim();
      if (!q) return [];
      return fuzzy(visibleCards.value, q, ["nazwa"]).slice(0, 8);
    });

    function selectSearchHit(card) {
      searchQuery.value = "";
      searchOpen.value = false;
      nextTick(() => scrollAndFlash(card.key));
    }

    function flashCard(el) {
      if (!el) return;
      el.classList.remove("card--flash");
      void el.offsetWidth;
      el.classList.add("card--flash");
      setTimeout(() => el.classList.remove("card--flash"), 1000);
    }

    function scrollAndFlash(key) {
      const strip = stripEl.value;
      if (!strip) return;
      const el = strip.querySelector(`[data-key="${key}"]`);
      if (!el) return;
      // offsetLeft/offsetWidth (nie getBoundingClientRect) — getBoundingClientRect zwraca
      // piksele viewportu PO zoomie UI (--ui-zoom), a scrollLeft/clientWidth są w lokalnej,
      // nieskalowanej przestrzeni elementu. Mieszanie ich psuło pozycję (rosnąco z dystansem)
      // przy zoomie != 100%. .cards ma teraz position:relative, więc offsetLeft jest
      // bezpośrednio względem paska, bez pośrednich, oddalonych ancestorów.
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      strip.scrollLeft = elCenter - strip.clientWidth / 2;
      flashCard(el);
    }

    function goCard(key) {
      view.value = "full";
      nextTick(() => scrollAndFlash(key));
    }

    function scrollNavToActive() {
      nextTick(() => {
        navEl.value?.querySelector(".is-active")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }

    function goDay(iso) {
      store.loadRaport(iso);
      scrollNavToActive();
    }

    function goToday() {
      store.loadRaport(store.today);
      scrollNavToActive();
    }

    return {
      store, asColor,
      activeWystawa, activeStan, toggleStan, view, spisGrupy, stripEl, navEl,
      cards, histoDate, historiaRows,
      searchQuery, searchOpen, searchHits, selectSearchHit,
      isToday, isFuture, isArchive, days, wystawy, visibleCards,
      statusOptions, STANY, stanDef,
      rec, setStatus, setOpis, setStan,
      focusWystawa, syncActiveWystawa, onWheel, goCard, mediaCard, openMedia, onMediaUploaded, zapiszStatus, savedKey,
      lightbox, openLightbox, lightboxImages, lightboxAlts, lightboxEditable, onLightboxAlt, onLightboxDelete,
      goDay, goToday,
      ctxMenu: ctxMenu.ctx, ctxBind: ctxMenu.bind, ctxClose: ctxMenu.close, consumeLongPress: ctxMenu.consumeLongPress,
      fotoCard, fotoItems, titleItems, onFotoUploaded, ownerKey,
      editTitleKey, editTitleVal, commitTitle, cancelTitle,
      goArchiwum: () => (store.activeTab = "archiwum"),
    };
  },
  template: `
  <div class="raport">

    <!-- ═══ Pasek filtrów — pełna szerokość ════════════════════════════ -->
    <header class="board__bar">
      <div class="filters">
        <button v-for="w in wystawy" :key="w.id"
                class="wfilter"
                :class="{ 'is-active': activeWystawa === w.id }"
                :style="{ '--wcolor': asColor(w.kolor) }"
                @click="focusWystawa(w.id)">{{ w.nazwa }}</button>
      </div>
      <div class="filters filters--sub">
        <span class="filters__lbl">Filtry</span>
        <button v-for="s in STANY" :key="s.v" class="sfilter sfilter--sq"
                :class="{ 'is-active': activeStan === s.v }"
                :style="{ background: s.color, '--scolor': s.color }"
                :title="s.label" :aria-label="s.label"
                @click="toggleStan(s.v)"></button>
        <button class="sfilter sfilter--toggle" :class="{ 'is-active': view === 'spis' }"
                @click="view = view === 'spis' ? 'full' : 'spis'">
          Spis Eksponatów
          <span class="sfilter__n">{{ visibleCards.length }}</span>
        </button>
        <button class="sfilter sfilter--toggle sfilter--histo" :class="{ 'is-active': view === 'history' }"
                @click="view = view === 'history' ? 'full' : 'history'"
                title="Historia statusów dzień po dniu — Ctrl+scroll przewija oś dni w pionie">
          <i class="ph-fill ph-clock-counter-clockwise"></i> Historia
        </button>
        <div class="card-search" :class="{ 'is-open': searchOpen && searchHits.length }">
          <span class="card-search__ico"><i class="ph-fill ph-magnifying-glass"></i></span>
          <input class="card-search__inp" v-model="searchQuery" type="search"
                 placeholder="Szukaj eksponatu…" autocomplete="off"
                 @focus="searchOpen = true"
                 @blur="searchOpen = false" />
          <ul v-if="searchOpen && searchHits.length" class="card-search__dropdown">
            <li v-for="hit in searchHits" :key="hit.key"
                class="card-search__item"
                @mousedown.prevent="selectSearchHit(hit)">
              <span class="card-search__item-name">{{ hit.nazwa }}</span>
              <span class="card-search__item-w">{{ hit.wystawa.nazwa }}</span>
            </li>
          </ul>
        </div>
      </div>
    </header>

    <!-- ═══ Ciało: daynav + karty w jednym kontenerze ══════════════════ -->
    <div class="raport__body">

      <aside class="daynav">
        <!-- Nakładka archiwum: poza scrollem, zawsze widoczna -->
        <Transition name="fade">
          <button v-if="!isToday" key="arch" class="daynav__arch" @click="goArchiwum">
            <i class="ph-fill ph-warning"></i> Przeglądasz Archiwum
          </button>
        </Transition>
        <!-- Scrollowalny kontener dat -->
        <div class="daynav__scroll">
          <ul class="daynav__list" ref="navEl">
            <li v-for="d in days" :key="d.iso"
                class="daynav__day"
                :class="{ 'is-active': d.iso === store.raportDate, 'is-today': d.isToday }"
                @click="goDay(d.iso)">
              <span class="daynav__dow">{{ d.dow }}</span>
              <span class="daynav__date">{{ d.dmy }}</span>
            </li>
          </ul>
          <Transition name="fade">
            <button v-if="!isToday" key="home" class="daynav__home" @click="goToday">
              Wróć do dziś <i class="ph-fill ph-arrow-up"></i>
            </button>
          </Transition>
        </div>
      </aside>

      <div class="raport__main" :class="{ 'is-loading': store.raportLoading }">

        <div v-if="isFuture" class="board__future">
          Przyszły dzień — raport jeszcze niewypełniony.
        </div>

        <div v-else class="cards" :class="'cards--' + view" ref="stripEl" @wheel="onWheel" @scroll="syncActiveWystawa">

          <!-- SPIS EKSPONATÓW: grupy wystawy -->
          <template v-if="view === 'spis'">
            <div v-for="grp in spisGrupy" :key="grp.id"
                 class="card-group"
                 :style="{ '--wcolor': grp.color }">
              <span class="card-group__lbl">{{ grp.nazwa }}</span>
              <div class="card-group__body">
                <div v-for="c in grp.cards" :key="c.key"
                     class="card__mini"
                     @click="goCard(c.key)">
                  <span class="card__mini-sq" :style="{ background: rec(c.key).stan ? 'var(--stan-' + rec(c.key).stan + ')' : 'var(--field)' }"></span>
                  <span class="card__mini-name">{{ c.nazwa }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- HISTORIA: macierz eksponaty(kolumny) × dni(wiersze). Scroll w bok = eksponaty,
               Ctrl+scroll = oś dni w pionie. Nagłówek = stan z oglądanego dnia. -->
          <table v-else-if="view === 'history'" class="histo">
            <thead>
              <tr>
                <th class="histo__corner">Dzień</th>
                <th v-for="c in cards" :key="c.key"
                    class="histo__exh" :class="{ 'histo__exh--grp': c.firstInGroup }"
                    :data-grp="c.wystawa.id" :style="{ '--wcolor': c.color }">
                  <span class="histo__exh-name" :title="c.wystawa.nazwa + ' — ' + c.nazwa + ' (kliknij, by przejść do karty)'"
                        @click="goCard(c.key)">{{ c.nazwa }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="day in historiaRows" :key="day.date"
                  :class="{ 'histo__row--live': day.date === store.raportDate }">
                <th class="histo__date">
                  {{ histoDate(day.date) }}<span v-if="day.date === store.today" class="histo__today"> • dziś</span>
                </th>
                <td v-for="c in cards" :key="c.key"
                    class="histo__cell" :class="{ 'histo__cell--grp': c.firstInGroup }">
                  <span class="histo__sq"
                        :class="{ 'histo__sq--none': !day.stany[c.key] }"
                        :style="{ background: day.stany[c.key] ? 'var(--stan-' + day.stany[c.key] + ')' : '' }"
                        :title="histoDate(day.date) + (day.stany[c.key] ? ' — ' + (stanDef(day.stany[c.key])?.label || day.stany[c.key]) : '')"></span>
                </td>
              </tr>
              <tr v-if="!store.raportHistoria.dni.length">
                <td class="histo__empty" :colspan="cards.length + 1">
                  Brak wcześniejszych zapisanych raportów — pokazany tylko bieżący dzień.
                </td>
              </tr>
            </tbody>
          </table>

          <!-- PEŁNA: płaskie karty -->
          <template v-else>
          <article v-for="c in visibleCards" :key="c.key"
                   class="card" :data-grp="c.wystawa.id" :data-key="c.key"
                   :style="{ '--wcolor': c.color }">
              <div v-if="c.img" class="card__bgphoto" :style="{ backgroundImage: 'url(' + c.img + ')' }"></div>
              <div class="card__head">
                <div class="card__titles">
                  <span class="card__wystawa">{{ c.wystawa.nazwa }}</span>
                  <input v-if="editTitleKey === c.key" class="card__title card__title-edit"
                         v-model="editTitleVal"
                         @keydown.enter.prevent="commitTitle(c)" @keydown.esc="cancelTitle"
                         @blur="commitTitle(c)" />
                  <span v-else class="card__title" title="Prawy klik / przytrzymaj → edytuj tytuł"
                        v-on="ctxBind(() => titleItems(c))">{{ c.nazwa }}</span>
                </div>
                <div class="card__thumb" title="Prawy klik / przytrzymaj → zmień zdjęcie"
                     v-on="ctxBind(() => fotoItems(c))">
                  <img v-if="c.img" v-skel="c.img" :src="c.img" :alt="c.nazwa" loading="lazy"
                       style="cursor:zoom-in" @click="!consumeLongPress() && openLightbox([c.img], 0)" />
                  <span v-else class="card__thumb-ph">brak<br>zdjęcia</span>
                </div>
                <MediaUpload
                  v-if="fotoCard?.key === c.key"
                  :open="true"
                  kontekst="eksponaty"
                  :owner-id="ownerKey(c)"
                  @uploaded="urls => onFotoUploaded(c, urls)"
                  @close="fotoCard = null"
                />
              </div>

              <!-- Kwadraty stanu — na samej górze, pod nagłówkiem -->
              <div class="card__states">
                <button v-for="s in STANY" :key="s.v" type="button" class="cstate"
                        :class="{ 'is-on': rec(c.key).stan === s.v, 'is-disabled': !store.raport.editable }"
                        :disabled="!store.raport.editable"
                        :title="s.label" :aria-pressed="rec(c.key).stan === s.v"
                        @click="setStan(c.key, s.v)">
                  <span class="cstate__sq" :style="{ background: s.color }"></span>
                  <span class="cstate__lbl">{{ s.label }}</span>
                </button>
              </div>

              <!-- Sekcja zależna od stanu: serwis / usterka / inne mają dropdown -->
              <template v-if="stanDef(rec(c.key).stan)?.hasStatus">
                <FuzzySelect :model-value="rec(c.key).status || null"
                             :options="statusOptions(rec(c.key).stan)"
                             placeholder="Wybierz status…" :disabled="!store.raport.editable"
                             @update:modelValue="(v) => setStatus(c.key, v)" />

                <!-- Po wyborze predefiniowanego statusu: opis + media -->
                <template v-if="rec(c.key).status">
                  <textarea class="card__inny" v-livemodel="rec(c.key).opis || ''"
                            :disabled="!store.raport.editable"
                            v-spellfocus
                            placeholder="Szczegółowy opis…"
                            @input="(e) => setOpis(c.key, e.target.value)"></textarea>

                  <div class="card__media">
                    <div v-if="rec(c.key).media?.length" class="card__media-thumbs">
                      <img v-for="(m, i) in rec(c.key).media" :key="i" v-skel :src="m"
                           style="cursor:zoom-in" @click="openLightbox(rec(c.key).media, i, c.key)" />
                    </div>
                    <button class="btn-media" :class="{ 'is-disabled': !store.raport.editable }"
                            :disabled="!store.raport.editable"
                            @click="openMedia(c)">
                      <i class="ph-fill ph-camera"></i> Dodaj media
                    </button>
                  </div>

                  <MediaUpload
                    v-if="mediaCard?.key === c.key"
                    :open="true"
                    kontekst="raport"
                    :owner-id="store.raportDate + '_' + c.key.replace(/[^A-Za-z0-9]+/g,'_')"
                    @uploaded="urls => onMediaUploaded(c, urls)"
                    @close="mediaCard = null"
                  />
                </template>

                <!-- Zapisz status — tylko Serwis / Usterka / Inne. Proste, jednoznaczne
                     zapisanie zmiany (dane i tak autosave'ują się na bieżąco) — bez
                     tworzenia zamówienia/zakupu. -->
                <button class="btn-zapisz" :class="{ 'is-saved': savedKey === c.key }"
                        :disabled="!store.raport.editable" @click="zapiszStatus(c)">
                  <i :class="savedKey === c.key ? 'ph-fill ph-check' : 'ph-fill ph-floppy-disk'"></i>
                  {{ savedKey === c.key ? 'Zapisano' : 'Zapisz status' }}
                </button>
              </template>
          </article>
          </template>

        </div>
      </div>
    </div>
    <ImageModal
      :images="lightboxImages"
      :start="lightbox?.start || 0"
      :alts="lightboxAlts"
      :editable="lightboxEditable"
      @alt="onLightboxAlt"
      @delete="onLightboxDelete"
      @close="lightbox = null"
    />
    <ContextMenu :menu="ctxMenu" @close="ctxClose" />
  </div>
  `,
};
