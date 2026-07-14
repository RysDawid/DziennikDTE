// Wspólna logika zakładek "kart modularnych" (Przerwa techniczna / Projekty).
// Analogicznie do cardTab.js/useCardTab dla kart klasycznych — obie zakładki mają
// identyczny zestaw zachowań i różnią się tylko nazwą kolekcji oraz etykietami.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import Sortable from "sortable";
import { store } from "../store.js";
import { STATUSY_MODULAR } from "../components/ModularCard.js";
import { useContextMenu } from "../components/ContextMenu.js";

/**
 * @param {string} coll      Nazwa kolekcji w store ("przerwa" | "projekty").
 * @param {object} opts
 * @param {string} opts.newTitle  Tytuł nadawany nowo utworzonej karcie.
 * @param {string} opts.addLabel  Etykieta na przycisku "+"/placeholderze pustej kolekcji.
 * @param {boolean} [opts.hasStatus=true]  false = brak statusów (np. Przerwa techniczna) —
 *   bez paska filtrów, "+" dodaje kartę od razu (bez wyboru statusu), karty renderują się szare.
 */
export function useModularTab(coll, { newTitle, addLabel, hasStatus = true }) {
  const activeStatus = ref(null);
  const stripEl = ref(null);
  const fullscreenCard = ref(null);
  const ctxMenu = useContextMenu();
  const historyOpen = ref(false); // panel Historii (zamknięte karty) wysunięty?
  const archRefresh = ref(0); // bump → HistoryPanel przeładowuje archiwum
  const archCount = computed(() => store.archCount[coll] || 0); // badge na przycisku Historii
  function toggleHistory() { historyOpen.value = !historyOpen.value; }

  const filtered = computed(() =>
    activeStatus.value
      ? store[coll].filter((c) => c.status === activeStatus.value)
      : store[coll]
  );
  const isEmpty = computed(() => store[coll].length === 0);

  async function addCard(status) {
    await store.createCard(coll, { tytul: newTitle, status: status || "oczekujace" });
    nextTick(() => { if (stripEl.value) stripEl.value.scrollLeft = 0; });
  }
  function addCardMenu(e) {
    if (!hasStatus) { addCard(null); return; }
    const items = STATUSY_MODULAR.map((s) => ({
      label: s.label, color: s.cls === "pilne" ? "#ef4d5a" : "#f0a23c",
      action: () => addCard(s.v),
    }));
    ctxMenu.open(e, { header: "Nowa karta — status:", items });
  }

  async function archiveCard(card) {
    await store.archiveCard(coll, card.id);
    archRefresh.value++; // odśwież panel Historii, jeśli otwarty
  }
  function deleteCard(card) { store.deleteCard(coll, card.id); }

  function openFullscreen(card) { fullscreenCard.value = card; }
  function closeFullscreen() { fullscreenCard.value = null; }

  function onWheel(e) {
    const strip = stripEl.value;
    if (!strip) return;
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
      draggable: ".pcard:not(.karta--add)",
      filter: ".karta--add",
      onEnd() {
        const newOrder = [...stripEl.value.querySelectorAll(".pcard[data-id]")].map((el) => el.dataset.id);
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
    coll, addLabel, hasStatus,
    STATUSY_MODULAR, activeStatus, stripEl, filtered, isEmpty,
    addCard, addCardMenu, archiveCard, deleteCard, onWheel,
    fullscreenCard, openFullscreen, closeFullscreen,
    historyOpen, toggleHistory, archRefresh, archCount,
    ctxMenu: ctxMenu.ctx, ctxClose: ctxMenu.close,
  };
}
