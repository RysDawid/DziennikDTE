// Panel Historii — wysuwane z prawej strony boczne panele z zamkniętymi
// (zarchiwizowanymi) kartami danej kolekcji. Wspólny dla obu typów zakładek:
// klasycznych (Problemy/Zakupy/Eksploatacja) i modularnych (Projekty/Przerwa).
//
// - lista zamkniętych wątków pogrupowana po dniu zamknięcia (najnowsze u góry),
//   każdy wpis = godzina zamknięcia + tytuł karty (bez koloru statusu),
// - wyszukiwarka archiwum z zakresem: „szukaj w tytułach" / „szukaj w treści",
// - klik w archiwalny wpis → lightbox pokazujący CAŁĄ kartę tak, jak wyglądała
//   (modularne: ten sam ModularCard w trybie readonly; klasyczne: wierny podgląd).
import { ref, computed, watch } from "vue";
import { store } from "../store.js";
import { chatTime, formatBytes } from "../utils.js";
import { prioHex } from "../tabs/cardTab.js";
import ModularCard from "./ModularCard.js";
import ImageModal from "./ImageModal.js";

const MODULAR = new Set(["przerwa", "projekty"]);
const MIESIACE = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

function fullDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MIESIACE[d.getMonth()]} ${d.getFullYear()}`;
}
function timeOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default {
  components: { ModularCard, ImageModal },
  props: {
    coll: { type: String, required: true },
    open: { type: Boolean, default: false },
    refresh: { type: Number, default: 0 }, // bump → przeładuj archiwum (np. po zamknięciu karty)
  },
  emits: ["close"],
  setup(props) {
    const items = ref([]);
    const loading = ref(false);
    const q = ref("");
    const inTitles = ref(true);
    const inContent = ref(true);
    const selected = ref(null); // archiwalna karta otwarta w lightboxie
    const imgLb = ref(null); // { images, start } — galeria zdjęć karty klasycznej

    const isModular = computed(() => MODULAR.has(props.coll));
    // Przerwa techniczna nie ma statusów (pasek zawsze szary) — musimy to oddać
    // wiernie w podglądzie zarchiwizowanej karty, tak jak w widoku na żywo.
    const cardHasStatus = computed(() => props.coll !== "przerwa");

    async function load() {
      loading.value = true;
      try {
        items.value = await store.loadArchiwum(props.coll);
      } finally {
        loading.value = false;
      }
    }
    watch(() => props.open, (o) => { if (o) load(); });
    watch(() => props.refresh, () => { if (props.open) load(); });

    // Tekst „treści" karty do przeszukiwania (zależny od typu karty) — obejmuje
    // też nazwy załączników, wspólne dla obu typów kart.
    function contentText(card) {
      const attachNames = (card.zalaczniki || []).map((a) => a.nazwa || "").join(" ");
      if (MODULAR.has(props.coll)) {
        const els = (card.updates || []).flatMap((u) => (u.elementy || []).map((e) => e.tresc || ""));
        return [...els, attachNames].join(" ");
      }
      return [card.opis || "", ...(card.komentarze || []).map((k) => k.tekst || ""), attachNames].join(" ");
    }

    const filtered = computed(() => {
      const term = q.value.trim().toLowerCase();
      if (!term) return items.value;
      // Gdy oba zakresy odznaczone — nie filtrujemy „do zera": szukamy wszędzie.
      const bothOff = !inTitles.value && !inContent.value;
      return items.value.filter((c) => {
        const inT = (inTitles.value || bothOff) && (c.tytul || "").toLowerCase().includes(term);
        const inC = (inContent.value || bothOff) && contentText(c).toLowerCase().includes(term);
        return inT || inC;
      });
    });

    // Grupowanie po dniu zamknięcia (backend zwraca już malejąco po closedAt).
    const groups = computed(() => {
      const map = new Map();
      for (const c of filtered.value) {
        const day = (c.closedAt || "").slice(0, 10);
        if (!map.has(day)) map.set(day, []);
        map.get(day).push(c);
      }
      return [...map.entries()].map(([day, cards]) => ({ day, cards }));
    });

    // Etykieta lokalizacji karty klasycznej (id / "subid::nazwa" → nazwa).
    function lokLabel(value) {
      if (!value) return null;
      for (const lok of store.lokacje) {
        const subs = lok.pod_lokalizacje || [];
        if (!subs.length) {
          if (lok.id === value) return lok.nazwa;
          continue;
        }
        for (const sub of subs) {
          if (sub.id === value) return sub.nazwa;
          for (const e of sub.eksponaty || []) {
            if (`${sub.id}::${e.nazwa}` === value) return e.nazwa;
          }
        }
      }
      return value;
    }

    function openImg(card, start) {
      if (!card.zdjecia?.length) return;
      imgLb.value = { images: card.zdjecia, start };
    }

    // Trwałe usunięcie karty z historii/archiwum — do historii trafia tylko coś
    // rozwiązanego/zakończonego; „usunięta" karta znika stąd całkowicie (razem z mediami).
    async function deleteFromHistory(card) {
      const t = card.tytul || "Bez tytułu";
      if (!confirm(`Usunąć „${t}" trwale z historii? Tej operacji nie można cofnąć.`)) return;
      await store.deleteCard(props.coll, card.id);
      items.value = items.value.filter((c) => c.id !== card.id);
      if (selected.value?.id === card.id) selected.value = null;
    }

    // Przywrócenie wątku z archiwum do aktywnych — znika z Historii, wraca na strip.
    async function restoreFromHistory(card) {
      await store.restoreCard(props.coll, card.id);
      items.value = items.value.filter((c) => c.id !== card.id);
      if (selected.value?.id === card.id) selected.value = null;
    }

    return {
      items, loading, q, inTitles, inContent, selected, imgLb,
      isModular, cardHasStatus, filtered, groups, lokLabel, openImg,
      deleteFromHistory, restoreFromHistory,
      prioHex, chatTime, formatBytes, fullDate, timeOnly,
    };
  },
  template: `
  <Transition name="histslide">
    <aside v-if="open" class="histpanel">
      <div class="histpanel__head">
        <div class="histpanel__title"><i class="ph-fill ph-clock-counter-clockwise"></i> Historia</div>
        <button class="histpanel__x" @click="$emit('close')" title="Zamknij historię"><i class="ph ph-x"></i></button>
      </div>

      <div class="histpanel__search">
        <div class="histpanel__searchrow">
          <i class="ph ph-magnifying-glass"></i>
          <input v-model="q" placeholder="Szukaj w archiwum…" />
          <button v-if="q" class="histpanel__clear" @click="q = ''" title="Wyczyść"><i class="ph ph-x"></i></button>
        </div>
        <div class="histpanel__scopes">
          <label><input type="checkbox" v-model="inTitles" /> szukaj w tytułach</label>
          <label><input type="checkbox" v-model="inContent" /> szukaj w treści</label>
        </div>
      </div>

      <div class="histpanel__list">
        <div v-if="loading" class="histpanel__empty">Wczytywanie…</div>
        <div v-else-if="!filtered.length" class="histpanel__empty">
          {{ q ? 'Brak wyników wyszukiwania.' : 'Brak zamkniętych kart w archiwum.' }}
        </div>
        <template v-else>
          <div v-for="g in groups" :key="g.day" class="histgroup">
            <div class="histgroup__date">
              <span>{{ fullDate(g.cards[0].closedAt) }}</span>
              <span class="histgroup__count">{{ g.cards.length }}</span>
            </div>
            <div
              v-for="c in g.cards" :key="c.id"
              class="histitem" :class="{ 'is-open': selected && selected.id === c.id }"
            >
              <button class="histitem__open" @click="selected = c">
                <span class="histitem__time">{{ timeOnly(c.closedAt) }}</span>
                <span class="histitem__title">{{ c.tytul || 'Bez tytułu' }}</span>
              </button>
              <i class="ph ph-caret-right histitem__arr"></i>
              <button class="histitem__act histitem__restore" @click.stop="restoreFromHistory(c)" title="Przywróć wątek do aktywnych"><i class="ph-fill ph-arrow-counter-clockwise"></i></button>
              <button class="histitem__act histitem__del" @click.stop="deleteFromHistory(c)" title="Usuń trwale z historii"><i class="ph-fill ph-trash"></i></button>
            </div>
          </div>
        </template>
      </div>
    </aside>
  </Transition>

  <Teleport to="body">
    <Transition name="histfade">
      <div v-if="selected" class="pcard-overlay hist-overlay" @click.self="selected = null">

        <div class="hist-lb-actions">
          <button class="hist-lb-btn hist-lb-restore" @click="restoreFromHistory(selected)" title="Przywróć wątek do aktywnych">
            <i class="ph-fill ph-arrow-counter-clockwise"></i> Przywróć
          </button>
          <button class="hist-lb-btn hist-lb-del" @click="deleteFromHistory(selected)" title="Usuń tę kartę trwale z historii">
            <i class="ph-fill ph-trash"></i> Usuń trwale
          </button>
        </div>

        <ModularCard
          v-if="isModular"
          :coll="coll" :card="selected" :has-status="cardHasStatus" fullscreen readonly
          @close-fullscreen="selected = null"
        />

        <article v-else class="karta hist-cardview" :style="{ '--prio': prioHex(selected.priorytet) }">
          <div class="karta__head">
            <i class="karta__ico-status ph-fill ph-flag" style="cursor:default"></i>
            <span class="karta__title hist-cardview__title">{{ selected.tytul || 'Bez tytułu' }}</span>
            <button class="hist-cardview__x" @click="selected = null" title="Zamknij"><i class="ph ph-x"></i></button>
          </div>

          <div class="karta__body">
            <div v-if="lokLabel(selected.lokalizacja)" class="krow">
              <span class="krow__ico"><i class="ph-fill ph-map-pin"></i></span>
              <div class="krow__cnt hist-ro-val">{{ lokLabel(selected.lokalizacja) }}</div>
            </div>

            <div v-if="selected.zdjecia?.length" class="krow">
              <span class="krow__ico" style="margin-top:6px"><i class="ph-fill ph-camera"></i></span>
              <div class="krow__cnt karta__gallery">
                <div v-if="selected.zdjecia.length === 2" class="karta__gallery-pair">
                  <img v-for="(z,i) in selected.zdjecia" :key="i" v-skel :src="z" @click="openImg(selected, i)" />
                </div>
                <template v-else>
                  <img class="karta__gallery-main" v-skel="selected.zdjecia[0]" :src="selected.zdjecia[0]" @click="openImg(selected, 0)" />
                  <div v-if="selected.zdjecia.length > 1" class="karta__thumbs">
                    <img v-for="(z,i) in selected.zdjecia.slice(1)" :key="i" v-skel :src="z" @click="openImg(selected, i + 1)" />
                  </div>
                </template>
              </div>
            </div>

            <div v-if="selected.zalaczniki?.length" class="krow">
              <span class="krow__ico"><i class="ph-fill ph-paperclip"></i></span>
              <div class="krow__cnt attach-list">
                <div v-for="a in selected.zalaczniki" :key="a.url" class="attach-item">
                  <i class="attach-item__ico ph-fill ph-file"></i>
                  <span class="attach-item__name">{{ a.nazwa }}</span>
                  <span class="attach-item__size">{{ formatBytes(a.rozmiar) }}</span>
                  <a class="attach-item__dl" :href="a.url" :download="a.nazwa" title="Pobierz"><i class="ph-fill ph-download-simple"></i></a>
                </div>
              </div>
            </div>

            <div v-if="selected.opis" class="krow">
              <span class="krow__ico"><i class="ph-fill ph-info"></i></span>
              <div class="krow__cnt hist-ro-desc">{{ selected.opis }}</div>
            </div>

            <div v-if="selected.komentarze?.length" class="krow karta__chat">
              <span class="krow__ico" title="Chat"><i class="ph-fill ph-chat-circle-text"></i></span>
              <div class="krow__cnt">
                <div class="chat-msgs">
                  <div v-for="m in selected.komentarze" :key="m.id" class="chat-msg" :class="'chat-msg--' + m.autor">
                    <div class="chat-bubble" :class="{ 'chat-bubble--deleted': m.usunieta }">
                      <span v-if="m.usunieta" class="chat-deleted-lbl"><i class="ph ph-prohibit"></i> Wiadomość usunięta</span>
                      <template v-else>{{ m.tekst }}</template>
                    </div>
                    <div class="chat-ts">{{ chatTime(m.ts) }}<span v-if="m.editedAt && !m.usunieta" class="chat-edited"> · edytowano {{ chatTime(m.editedAt) }}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="karta__footer karta__footer--closed">
            <span><i class="ph-fill ph-archive-box"></i> Zamknięto: {{ chatTime(selected.closedAt) }}</span>
          </div>
        </article>
      </div>
    </Transition>

    <ImageModal :images="imgLb?.images || []" :start="imgLb?.start || 0" :editable="false" @close="imgLb = null" />
  </Teleport>
  `,
};
