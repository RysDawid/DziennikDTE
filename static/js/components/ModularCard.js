// Karta modularna — nowy, bardziej dynamiczny typ karty (użyty przez Przerwę techniczną
// i Projekty): pasek statusu + fullscreen, nagłówek (flaga = status/dodaj update), i
// modularna lista "updates" (najnowszy na górze), gdzie każdy update ma własną, przeciąganą
// listę elementów (opis/link/media/kontakt/cena). Kolekcja (nazwa API) przychodzi propem
// `coll`, więc ten sam komponent obsługuje dowolną liczbę zakładek tego typu.
// Ten sam komponent renderuje kartę zarówno w normalnym pasku, jak i w trybie pełnoekranowym
// (prop `fullscreen`) — więc "wątek na forum" to po prostu ta sama karta, tylko powiększona.
import { ref, computed } from "vue";
import { store } from "../store.js";
import { chatTime, formatBytes } from "../utils.js";
import { useContextMenu } from "./ContextMenu.js";
import MediaUpload from "./MediaUpload.js";
import AttachmentUpload from "./AttachmentUpload.js";
import ImageModal from "./ImageModal.js";
import ContextMenu from "./ContextMenu.js";
import Sortable from "sortable";

export const STATUSY_MODULAR = [
  { v: "aktywne", label: "Aktywne", cls: "pilne", hex: "var(--pilne)" },
  { v: "oczekujace", label: "Oczekujące", cls: "oczekujace", hex: "var(--oczekujace)" },
];

const EL_TYPES = [
  { v: "opis", label: "Opis", icon: "ph-fill ph-note" },
  { v: "link", label: "Link", icon: "ph-fill ph-link" },
  { v: "media", label: "Media", icon: "ph-fill ph-image" },
  { v: "kontakt", label: "Kontakt", icon: "ph-fill ph-user" },
  { v: "cena", label: "Cena", icon: "ph-fill ph-tag" },
];
const EL_ICO = Object.fromEntries(EL_TYPES.map((t) => [t.v, t.icon]));
const EL_PLACEHOLDER = {
  link: "https://… lub ścieżka folderu/pliku (np. C:\\Dane\\Projekt lub /mnt/dane)…",
  kontakt: "Osoba / telefon / e-mail…",
  cena: "Kwota…",
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Adres webowy (ma schemat protokołu, np. https://, ftp://) vs lokalna ścieżka
// (folder/plik) — przeglądarka nie umie nawigować do file://, więc lokalne
// ścieżki otwieramy przez backend (natywny eksplorator plików na hoście).
function isWebUrl(v) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v);
}

export default {
  components: { MediaUpload, AttachmentUpload, ImageModal, ContextMenu },
  props: {
    coll: { type: String, required: true }, // nazwa kolekcji API, np. "przerwa" / "projekty"
    card: { type: Object, required: true },
    fullscreen: { type: Boolean, default: false },
    hasStatus: { type: Boolean, default: true }, // false = Przerwa techniczna: brak statusów, pasek zawsze szary
    readonly: { type: Boolean, default: false }, // true = podgląd zarchiwizowanej karty (panel Historii): bez edycji/akcji
  },
  emits: ["open-fullscreen", "close-fullscreen", "archive", "delete"],
  setup(props, { emit }) {
    const ctxMenu = useContextMenu();
    const mediaTarget = ref(null); // element typu "media", dla którego otwarty jest MediaUpload
    const coverUploadOpen = ref(false); // upload okładki karty (osobny od mediaTarget — nie jest elementem update'u)
    const attachUploadOpen = ref(false); // upload załączników karty (osobny od mediaTarget)
    const lightbox = ref(null); // { images, start }

    function save() {
      store.patchCard(props.coll, props.card.id, {
        tytul: props.card.tytul,
        status: props.card.status,
        updates: props.card.updates,
        okladka: props.card.okladka,
        zalaczniki: props.card.zalaczniki,
      });
    }
    function setTitle(v) { props.card.tytul = v; save(); }
    function setStatus(v) { props.card.status = v; save(); }

    function addUpdate() {
      props.card.updates.unshift({ id: genId(), data: new Date().toISOString(), elementy: [] });
      save();
    }
    // Twarde usunięcie — nieodwracalne, więc z potwierdzeniem (jak w innych zakładkach).
    function deleteCard() {
      if (!confirm(`Usunąć kartę „${props.card.tytul}" na stałe? Tej operacji nie można cofnąć.`)) return;
      emit("delete", props.card);
    }
    function addCover() { coverUploadOpen.value = true; }
    function removeCover() { props.card.okladka = null; save(); }
    function onCoverUploaded(urls) {
      if (urls[0]) { props.card.okladka = urls[0]; save(); }
      coverUploadOpen.value = false;
    }
    function coverStyle() {
      if (!props.card.okladka) return {};
      return {
        backgroundImage:
          `linear-gradient(180deg, var(--panel-2) 0%, rgba(20,24,32,0.55) 45%, transparent 100%), url("${props.card.okladka}")`,
      };
    }

    // Załączniki (dowolne pliki) — karta-poziomowe, jak okładka; nie należą do
    // żadnego konkretnego update'u. Identyfikowane po URL-u (unikalny).
    function addAttachment() { attachUploadOpen.value = true; }
    function onAttachUploaded(items) {
      props.card.zalaczniki = [...(props.card.zalaczniki || []), ...items];
      save();
      attachUploadOpen.value = false;
    }
    function deleteAttachment(att) {
      if (!confirm(`Usunąć załącznik „${att.nazwa}"? Tej operacji nie można cofnąć.`)) return;
      props.card.zalaczniki = (props.card.zalaczniki || []).filter((a) => a.url !== att.url);
      save();
    }
    function attachMenuItems(att) {
      return [{ label: "Usuń załącznik", icon: "ph-fill ph-trash", danger: true,
        action: () => deleteAttachment(att) }];
    }

    function flagItems() {
      return [
        ...(props.hasStatus ? STATUSY_MODULAR.map((s) => ({
          label: s.label, color: s.cls === "pilne" ? "#ef4d5a" : "#f0a23c",
          active: props.card.status === s.v, action: () => setStatus(s.v),
        })) : []),
        { label: "Dodaj update", icon: "ph-fill ph-plus", action: addUpdate },
        ...(props.card.okladka
          ? [
              { label: "Zmień okładkę", icon: "ph-fill ph-image", action: addCover },
              { label: "Usuń okładkę", icon: "ph-fill ph-image-broken", action: removeCover },
            ]
          : [{ label: "Dodaj okładkę", icon: "ph-fill ph-image", action: addCover }]),
        { label: "Dodaj załącznik", icon: "ph-fill ph-paperclip", action: addAttachment },
        { label: "Usuń kartę", icon: "ph-fill ph-trash", danger: true, action: deleteCard },
      ];
    }

    function addElement(u, typ) {
      const el = { id: genId(), typ };
      if (typ === "media") el.urls = [];
      else el.tresc = "";
      u.elementy.push(el);
      save();
      if (typ === "media") mediaTarget.value = el;
    }
    function elItems(u) {
      return EL_TYPES.map((t) => ({ label: "Dodaj: " + t.label, icon: t.icon, action: () => addElement(u, t.v) }));
    }
    function removeEl(u, el) {
      const i = u.elementy.indexOf(el);
      if (i >= 0) u.elementy.splice(i, 1);
      save();
    }
    function elMenuItems(u, el) {
      return [{ label: "Usuń element", icon: "ph-fill ph-trash", danger: true, action: () => removeEl(u, el) }];
    }
    function setElContent(el, v) { el.tresc = v; save(); }
    function reorderEl(u, order) {
      const pos = Object.fromEntries(order.map((id, i) => [id, i]));
      u.elementy.sort((a, b) => (pos[a.id] ?? 1e4) - (pos[b.id] ?? 1e4));
      save();
    }
    function onMediaUploaded(el, urls) {
      el.urls = [...(el.urls || []), ...urls];
      save();
      mediaTarget.value = null;
    }
    // Trzymamy referencję do samego elementu (nie kopii tablicy urls) — dzięki
    // temu usunięcie zdjęcia (które podmienia el.urls na nową tablicę) widać
    // od razu w otwartym lightboxie, przez computed czytany na żywo poniżej.
    function openLightbox(el, start) { lightbox.value = { el, start }; }
    const lightboxImages = computed(() => lightbox.value?.el?.urls || []);
    function onLightboxDelete(url) {
      const el = lightbox.value?.el;
      if (!el || props.readonly) return;
      el.urls = (el.urls || []).filter((u) => u !== url);
      save();
      if (!el.urls.length) lightbox.value = null;
    }

    // Element "link": adres webowy -> nowa karta przeglądarki; lokalna ścieżka
    // (folder/plik) -> otwórz natywnego eksploratora plików przez backend.
    async function openLink(v) {
      if (!v) return;
      if (isWebUrl(v)) { window.open(v, "_blank", "noopener"); return; }
      try {
        const res = await fetch("/api/open-path", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: v }),
        });
        if (!res.ok) throw new Error();
      } catch {
        alert(`Nie udało się otworzyć: ${v}`);
      }
    }

    return {
      ctxMenu: ctxMenu.ctx, ctxOpen: ctxMenu.open, ctxBind: ctxMenu.bind, ctxClose: ctxMenu.close,
      mediaTarget, coverUploadOpen, attachUploadOpen, lightbox, lightboxImages, chatTime, formatBytes,
      setTitle, flagItems, addUpdate, elItems, addElement, removeEl, elMenuItems, setElContent,
      reorderEl, onMediaUploaded, openLightbox, onLightboxDelete, openLink, onCoverUploaded, coverStyle,
      onAttachUploaded, attachMenuItems,
      elIcon: (typ) => EL_ICO[typ] || "ph-fill ph-note",
      elPlaceholder: (typ) => EL_PLACEHOLDER[typ] || "",
      linkOpenIcon: (v) => (isWebUrl(v) ? "ph-fill ph-arrow-square-out" : "ph-fill ph-folder-open"),
      linkOpenTitle: (v) => (isWebUrl(v) ? "Otwórz link" : "Otwórz w eksploratorze plików"),
    };
  },
  directives: {
    // Sortowanie elementów WEWNĄTRZ jednego update'u — lokalna dyrektywa (nie globalna),
    // bo to ściśle wewnętrzny mechanizm tego komponentu.
    sortable: {
      mounted(el, binding) {
        el._sortable = Sortable.create(el, {
          animation: 150,
          handle: ".pel__handle",
          draggable: ".pel",
          onEnd() {
            const order = [...el.querySelectorAll(".pel")].map((n) => n.dataset.id);
            binding.value?.(order);
          },
        });
      },
      beforeUnmount(el) { el._sortable?.destroy(); },
    },
  },
  template: `
  <article class="pcard" :class="{ 'pcard--full': fullscreen }" :style="{ '--pstatus': !hasStatus ? 'var(--border-strong)' : (card.status === 'aktywne' ? 'var(--pilne)' : 'var(--oczekujace)') }">
    <div class="pcard__stripe">
      <button v-if="!fullscreen" class="pcard__full-btn" @click="$emit('open-fullscreen', card)" title="Powiększ (wątek)"><i class="ph-fill ph-arrows-out"></i></button>
      <button v-else class="pcard__full-btn" @click="$emit('close-fullscreen')" title="Zamknij"><i class="ph ph-x"></i></button>
    </div>

    <div class="karta__head" :class="{ 'karta__head--cover': card.okladka }" :style="coverStyle()">
      <button v-if="!readonly" class="karta__ico-status" @click.stop="ctxOpen($event, flagItems())" title="Status / dodaj update / okładka"><i class="ph-fill ph-flag"></i></button>
      <i v-else class="karta__ico-status ph-fill ph-flag" style="cursor:default"></i>
      <input class="karta__title" v-livemodel="card.tytul" :readonly="readonly" @change="e => setTitle(e.target.value)" />
      <span v-if="!fullscreen && !readonly" class="drag-handle" title="Przeciągnij, aby zmienić kolejność"></span>
    </div>
    <MediaUpload
      v-if="coverUploadOpen"
      :open="true" :kontekst="coll" :owner-id="card.id"
      @uploaded="onCoverUploaded"
      @close="coverUploadOpen = false"
    />

    <!-- Załączniki (dowolne pliki) — karta-poziomowe, jak okładka. Prawy klik /
         przytrzymaj na pliku → usuń (ukryte w trybie readonly, pobieranie zawsze działa). -->
    <div v-if="card.zalaczniki?.length" class="pcard__attach">
      <div v-for="a in card.zalaczniki" :key="a.url" class="attach-item"
           v-on="readonly ? {} : ctxBind(() => attachMenuItems(a))" :title="readonly ? '' : 'Prawy klik / przytrzymaj → usuń'">
        <i class="attach-item__ico ph-fill ph-file"></i>
        <span class="attach-item__name">{{ a.nazwa }}</span>
        <span class="attach-item__size">{{ formatBytes(a.rozmiar) }}</span>
        <a class="attach-item__dl" :href="a.url" :download="a.nazwa" @click.stop title="Pobierz"><i class="ph-fill ph-download-simple"></i></a>
      </div>
    </div>
    <AttachmentUpload
      v-if="attachUploadOpen"
      :open="true" :kontekst="coll" :owner-id="card.id"
      @uploaded="onAttachUploaded"
      @close="attachUploadOpen = false"
    />

    <div class="pcard__updates">
      <div v-if="!card.updates.length" class="pcard__empty">
        {{ readonly ? "Brak update'ów w tej karcie." : "Brak jeszcze żadnego update'u — dodaj pierwszy przez ikonę flagi." }}
      </div>
      <div v-for="u in card.updates" :key="u.id" class="pupd">
        <div class="pupd__bar">
          <button v-if="!readonly" class="pupd__cal" @click.stop="ctxOpen($event, elItems(u))" title="Dodaj element"><i class="ph-fill ph-calendar"></i></button>
          <i v-else class="pupd__cal ph-fill ph-calendar" style="cursor:default"></i>
          <span class="pupd__date">{{ chatTime(u.data) }}</span>
        </div>
        <div class="pupd__body" v-sortable="order => reorderEl(u, order)">
          <div v-for="el in u.elementy" :key="el.id" class="pel" :class="'pel--' + el.typ" :data-id="el.id">
            <i class="pel__ico" v-on="readonly ? {} : ctxBind(() => elMenuItems(u, el))" :title="readonly ? '' : 'Prawy klik / przytrzymaj → usuń element'" :class="elIcon(el.typ)"></i>

            <div v-if="el.typ === 'media'" class="pel__media">
              <img v-for="(mUrl,i) in (el.urls||[])" :key="i" v-skel :src="mUrl" @click="openLightbox(el, i)" />
              <button v-if="!readonly" class="btn-media pel__mediaBtn" @click="mediaTarget = el">Dodaj zdjęcia…</button>
            </div>
            <textarea v-else-if="el.typ === 'opis'" class="pel__txt" v-autogrow="el.tresc" v-spellfocus v-livemodel="el.tresc" :readonly="readonly"
                      placeholder="Opis…" @input="e => setElContent(el, e.target.value)"></textarea>
            <textarea v-else-if="el.typ === 'kontakt'" class="pel__txt" v-autogrow="el.tresc" v-spellfocus v-livemodel="el.tresc" :readonly="readonly"
                      :placeholder="elPlaceholder(el.typ)" @input="e => setElContent(el, e.target.value)"></textarea>
            <template v-else>
              <input class="pel__inp" v-livemodel="el.tresc" :placeholder="elPlaceholder(el.typ)" :readonly="readonly"
                     @change="e => setElContent(el, e.target.value)" />
              <button v-if="el.typ === 'link' && el.tresc" class="pel__open" @click="openLink(el.tresc)" :title="linkOpenTitle(el.tresc)"><i :class="linkOpenIcon(el.tresc)"></i></button>
            </template>

            <span v-if="!readonly" class="pel__handle drag-handle" title="Przeciągnij"></span>
          </div>
        </div>
        <MediaUpload
          v-if="!readonly && mediaTarget && u.elementy.includes(mediaTarget)"
          :open="true" :kontekst="coll" :owner-id="card.id"
          @uploaded="urls => onMediaUploaded(mediaTarget, urls)"
          @close="mediaTarget = null"
        />
      </div>
    </div>

    <div v-if="!readonly" class="karta__footer">
      <button class="btn-final" @click="$emit('archive', card)">Przenieś do archiwum</button>
    </div>
    <div v-else class="karta__footer karta__footer--closed">
      <span><i class="ph-fill ph-archive-box"></i> Zamknięto: {{ chatTime(card.closedAt) }}</span>
    </div>

    <ImageModal :images="lightboxImages" :start="lightbox?.start || 0" :deletable="!readonly" @delete="onLightboxDelete" @close="lightbox = null" />
    <ContextMenu :menu="ctxMenu" @close="ctxClose" />
  </article>
  `,
};
