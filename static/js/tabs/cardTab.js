// Wspólna logika zakładek kartowych (Problemy / Zakupy / Eksploatacja).
// Wszystkie trzy zakładki mają identyczny zestaw zachowań — filtr priorytetu,
// drag-reorder, galeria/lightbox, chat, archiwizacja — i różnią się tylko nazwą
// kolekcji oraz tytułem nowej karty. Logikę trzymamy tu raz; każda zakładka
// dokłada własny `template`.
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import Sortable from "sortable";
import { store } from "../store.js";
import { chatTime, formatBytes } from "../utils.js";
import { useContextMenu } from "../components/ContextMenu.js";

export const PRIO = [
  { v: "pilne",      label: "Pilne",         hex: "#ef4d5a" },
  { v: "oczekujace", label: "Oczekujące",     hex: "#f0a23c" },
  { v: "przyszlosc", label: "Przyszłościowe", hex: "#7bc05a" },
];

export function prioHex(v) {
  return PRIO.find((p) => p.v === v)?.hex ?? "#2f3744";
}

// Kolekcje kart, między którymi można przenosić karty (menu "Przenieś do:" pod flagą).
// Modularnie: dodanie tu nowej kolekcji automatycznie włącza ją jako cel przenoszenia
// we wszystkich zakładkach kartowych, bez zmian gdzie indziej.
export const CARD_COLLECTIONS = [
  { id: "problemy", label: "Problemy" },
  { id: "eksploatacja", label: "Eksploatacja" },
  { id: "zakupy", label: "Zakupy" },
];

/**
 * @param {string} coll      Nazwa kolekcji w store ("problemy" | "zakupy" | "eksploatacja").
 * @param {object} opts
 * @param {string} opts.newTitle  Tytuł nadawany nowo dodanej karcie.
 */
export function useCardTab(coll, { newTitle } = {}) {
  const activePrio = ref(null);
  const stripEl = ref(null);
  const replyText = reactive({});
  const replyAutor = reactive({});
  const mediaCardId = ref(null);
  const lightbox = ref(null); // { images, start, cardId }
  const historyOpen = ref(false); // panel Historii (zamknięte karty) wysunięty?
  const archRefresh = ref(0); // bump → HistoryPanel przeładowuje archiwum
  const archCount = computed(() => store.archCount[coll] || 0); // badge na przycisku Historii
  function toggleHistory() { historyOpen.value = !historyOpen.value; }

  function openLightbox(card, start) {
    if (!card.zdjecia?.length) return;
    lightbox.value = { start, cardId: card.id };
  }
  // 'images'/'alts' czytane na żywo z karty (po id), a nie zamrożone w momencie
  // otwarcia — inaczej usunięcie zdjęcia (które podmienia card.zdjecia na nową
  // tablicę) nie odświeżyłoby widoku w otwartym lightboxie.
  const lightboxImages = computed(() => {
    const c = store[coll].find((x) => x.id === lightbox.value?.cardId);
    return c?.zdjecia || [];
  });
  const lightboxAlts = computed(() => {
    const c = store[coll].find((x) => x.id === lightbox.value?.cardId);
    return c?.zdjeciaAlt || {};
  });
  function onLightboxAlt({ url, alt }) {
    const c = store[coll].find((x) => x.id === lightbox.value?.cardId);
    if (!c) return;
    patchCard(c.id, { zdjeciaAlt: { ...(c.zdjeciaAlt || {}), [url]: alt } });
  }
  // Trwałe usunięcie zdjęcia z galerii karty (menu w lightboxie) — zamyka
  // lightbox, gdy to było ostatnie zdjęcie.
  function onLightboxDelete(url) {
    const c = store[coll].find((x) => x.id === lightbox.value?.cardId);
    if (!c) return;
    const zdjecia = (c.zdjecia || []).filter((u) => u !== url);
    const zdjeciaAlt = { ...(c.zdjeciaAlt || {}) };
    delete zdjeciaAlt[url];
    patchCard(c.id, { zdjecia, zdjeciaAlt });
    if (!zdjecia.length) lightbox.value = null;
  }

  const lokOptions = computed(() => {
    const opts = [];
    for (const lok of store.lokacje) {
      const subs = lok.pod_lokalizacje || [];
      if (subs.length) {
        for (const sub of subs) {
          opts.push({ value: sub.id, label: sub.nazwa, group: lok.nazwa });
        }
        for (const sub of subs) {
          for (const e of sub.eksponaty || []) {
            opts.push({ value: `${sub.id}::${e.nazwa}`, label: e.nazwa, group: sub.nazwa });
          }
        }
      } else {
        opts.push({ value: lok.id, label: lok.nazwa });
      }
    }
    return opts;
  });

  const filtered = computed(() =>
    activePrio.value
      ? store[coll].filter((c) => c.priorytet === activePrio.value)
      : store[coll]
  );
  // Duży placeholder "Dodaj" ma sens tylko gdy w tej kolekcji nie ma JESZCZE żadnej karty —
  // (nie mylić z pustym wynikiem filtra priorytetu). Zwykłe dodawanie: mały "+" przy filtrach.
  const isEmpty = computed(() => store[coll].length === 0);

  function patchCard(id, data) {
    store.patchCard(coll, id, data);
  }

  async function addCard(prio) {
    await store.createCard(coll, {
      tytul: newTitle,
      priorytet: prio || activePrio.value || "oczekujace",
    });
    nextTick(() => {
      if (stripEl.value) stripEl.value.scrollLeft = 0;
    });
  }

  // "+" w pasku priorytetów — menu wyboru priorytetu nowej karty (zamiast cichego domyślnego).
  function addCardMenu(e) {
    const items = PRIO.map((p) => ({
      label: p.label,
      color: p.hex,
      action: () => addCard(p.v),
    }));
    ctxMenu.open(e, { header: "Nowa karta — priorytet:", items });
  }

  function getAutor(id) {
    return replyAutor[id] || "warsztat";
  }

  async function sendAs(card, autor) {
    const t = (replyText[card.id] || "").trim();
    if (!t) return;
    replyAutor[card.id] = autor;
    await store.addComment(coll, card.id, t, autor);
    replyText[card.id] = "";
    nextTick(() => {
      const el = document.querySelector(`[data-msgs="${card.id}"]`);
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // Wysyłka: kliknięcie / Enter otwiera menu "Wysyłasz jako:" (warsztat/biuro) —
  // zamiast osobnego przełącznika autora obok pola tekstowego.
  function openSendMenu(card, e) {
    const t = (replyText[card.id] || "").trim();
    if (!t) return;
    const row = e.target.closest(".chat-reply");
    const anchor = row?.querySelector(".chat-send") || e.target;
    const r = anchor.getBoundingClientRect();
    const items = [
      { label: "Warsztat", active: getAutor(card.id) === "warsztat", action: () => sendAs(card, "warsztat") },
      { label: "Biuro", active: getAutor(card.id) === "biuro", action: () => sendAs(card, "biuro") },
    ];
    ctxMenu.open({ clientX: r.left, clientY: r.bottom + 4 }, { header: "Wysyłasz jako:", items });
  }

  async function archiveCard(card) {
    await store.archiveCard(coll, card.id);
    archRefresh.value++; // odśwież panel Historii, jeśli otwarty
  }

  // Twarde usunięcie karty (menu przy fladze) — nieodwracalne, więc z potwierdzeniem.
  function deleteCard(card) {
    if (!confirm(`Usunąć kartę „${card.tytul}" na stałe? Tej operacji nie można cofnąć.`)) return;
    store.deleteCard(coll, card.id);
  }

  // Przeniesienie karty do innej kolekcji (menu przy fladze) — razem z komentarzami i mediami.
  function moveCard(card, target) {
    store.moveCard(coll, card.id, target);
  }

  // --- Edycja wiadomości czatu (menu kontekstowe) ------------------------ //
  const ctxMenu = useContextMenu();
  const editMsg = ref(null); // { cardId, msgId } | null
  const editMsgText = ref("");
  function msgItems(card, m) {
    if (m.usunieta) return [];
    return [
      { label: "Edytuj wiadomość", icon: "ph-fill ph-pencil-simple",
        action: () => startEditMsg(card, m) },
      { label: "Usuń wiadomość", icon: "ph-fill ph-trash", danger: true,
        action: () => deleteMsg(card, m) },
    ];
  }
  function deleteMsg(card, m) {
    store.deleteComment(coll, card.id, m.id);
  }
  function startEditMsg(card, m) {
    editMsg.value = { cardId: card.id, msgId: m.id };
    editMsgText.value = m.tekst;
    nextTick(() => {
      const el = document.querySelector(`[data-edit="${card.id}:${m.id}"]`);
      el?.focus();
      el?.select?.();
    });
  }
  async function commitEditMsg() {
    const e = editMsg.value;
    const t = editMsgText.value.trim();
    editMsg.value = null;
    if (!e || !t) return;
    const c = store[coll].find((x) => x.id === e.cardId);
    const m = c?.komentarze.find((k) => k.id === e.msgId);
    if (m && t !== m.tekst) await store.editComment(coll, e.cardId, e.msgId, t);
  }
  function cancelEditMsg() { editMsg.value = null; }

  function onMediaUploaded(card, urls) {
    patchCard(card.id, { zdjecia: [...(card.zdjecia || []), ...urls] });
    mediaCardId.value = null;
  }
  function addMedia(card) { mediaCardId.value = card.id; }

  // Załączniki (dowolne pliki, nie tylko zdjęcia) — osobna lista od 'zdjecia'.
  // Identyfikowane po URL-u (unikalny — nazwa pliku ma losowy prefiks nadany
  // przez backend), więc nie potrzebują własnego pola 'id'.
  const attachCardId = ref(null);
  function addAttachment(card) { attachCardId.value = card.id; }
  function onAttachUploaded(card, items) {
    patchCard(card.id, { zalaczniki: [...(card.zalaczniki || []), ...items] });
    attachCardId.value = null;
  }
  function deleteAttachment(card, att) {
    if (!confirm(`Usunąć załącznik „${att.nazwa}"? Tej operacji nie można cofnąć.`)) return;
    patchCard(card.id, { zalaczniki: (card.zalaczniki || []).filter((a) => a.url !== att.url) });
  }
  function attachMenuItems(card, att) {
    return [{ label: "Usuń załącznik", icon: "ph-fill ph-trash", danger: true,
      action: () => deleteAttachment(card, att) }];
  }

  // Pozycje menu flagi w nagłówku karty: priorytet + dodaj media/załącznik +
  // przeniesienie do innej kolekcji (modularnie, z CARD_COLLECTIONS — nowa
  // kolekcja dopisuje się tu sama) + usunięcie.
  function prioItems(card) {
    const moveItems = CARD_COLLECTIONS.filter((c) => c.id !== coll).map((c) => ({
      label: "Przenieś do: " + c.label,
      icon: "ph-fill ph-arrows-left-right",
      action: () => moveCard(card, c.id),
    }));
    return [
      ...PRIO.map((p) => ({
        label: p.label,
        color: p.hex,
        active: card.priorytet === p.v,
        action: () => patchCard(card.id, { priorytet: p.v }),
      })),
      { label: "Dodaj media", icon: "ph-fill ph-image", action: () => addMedia(card) },
      { label: "Dodaj załącznik", icon: "ph-fill ph-paperclip", action: () => addAttachment(card) },
      ...moveItems,
      { label: "Usuń kartę", icon: "ph-fill ph-trash", danger: true,
        action: () => deleteCard(card) },
    ];
  }

  function onWheel(e) {
    const strip = stripEl.value;
    if (!strip) return;
    // Jeśli kursor jest nad scrollowalnym dzieckiem (karta__body, chat-msgs itp.)
    // — pozwól na natywny pionowy scroll, nie przechwytuj zdarzenia.
    let el = e.target;
    while (el && el !== strip) {
      const ov = getComputedStyle(el).overflowY;
      if ((ov === "auto" || ov === "scroll") && el.scrollHeight > el.clientHeight) return;
      el = el.parentElement;
    }
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!delta) return;
    strip.scrollLeft += delta;
    e.preventDefault();
  }

  let sortable = null;
  onMounted(() => {
    if (!stripEl.value) return;
    sortable = Sortable.create(stripEl.value, {
      animation: 150,
      handle: ".drag-handle",
      draggable: ".karta:not(.karta--add)",
      filter: ".karta--add",
      onEnd() {
        const newOrder = [...stripEl.value.querySelectorAll(".karta[data-id]")].map(
          (el) => el.dataset.id
        );
        // Zachowaj pozycje kart spoza filtra (nie widocznych w DOM)
        const allIds = store[coll].map((c) => c.id);
        const visibleSet = new Set(newOrder);
        let vi = 0;
        const result = allIds.map((id) => (visibleSet.has(id) ? newOrder[vi++] : id));
        store.reorder(coll, result);
      },
    });
  });
  onBeforeUnmount(() => sortable?.destroy());

  return {
    coll,
    PRIO, activePrio, stripEl, filtered, isEmpty, lokOptions,
    prioHex, prioItems,
    historyOpen, toggleHistory, archRefresh, archCount,
    patchCard, addCard, addCardMenu,
    replyText, openSendMenu,
    archiveCard, mediaCardId, onMediaUploaded,
    attachCardId, onAttachUploaded, attachMenuItems,
    lightbox, openLightbox, lightboxImages, lightboxAlts, onLightboxAlt, onLightboxDelete,
    chatTime, formatBytes, onWheel,
    ctxMenu: ctxMenu.ctx, ctxBind: ctxMenu.bind, ctxOpen: ctxMenu.open, ctxClose: ctxMenu.close,
    editMsg, editMsgText, msgItems, commitEditMsg, cancelEditMsg,
  };
}
