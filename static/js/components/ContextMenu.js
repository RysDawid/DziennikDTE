// Reużywalne menu kontekstowe (globalna edycja). Otwierane prawym klikiem
// lub long-pressem (dotyk). Pozycjonowane do kursora, teleportowane do body.
//
// Użycie:
//   import ContextMenu, { useContextMenu } from "../components/ContextMenu.js";
//   const { ctx, bind, consumeLongPress, close } = useContextMenu();
//   ...w template:  <span v-on="bind(() => [{ label, icon, danger, action }])">…</span>
//                   <ContextMenu :menu="ctx" @close="close" />
import { ref, computed, watch, onBeforeUnmount } from "vue";

export function useContextMenu() {
  const ctx = ref(null); // { x, y, header?, items: [{ label, icon, danger, active, action }] } | null
  let timer = null;
  let longFired = false;

  // `itemsOrMenu`: tablica pozycji (jak dotychczas) albo { header, items } z podpisem u góry.
  function openAt(e, itemsOrMenu) {
    const cfg = Array.isArray(itemsOrMenu) ? { items: itemsOrMenu } : itemsOrMenu || {};
    if (!cfg.items || !cfg.items.length) return;
    const pt = e.touches?.[0] || e.changedTouches?.[0] || e;
    ctx.value = { x: pt.clientX, y: pt.clientY, header: cfg.header, items: cfg.items };
  }

  // Zwraca zestaw handlerów do v-on="bind(() => items)".
  // Klucze to SUROWE nazwy zdarzeń (Vue v-on="obj" sam doda prefiks on*).
  function bind(itemsFn) {
    return {
      contextmenu: (e) => { e.preventDefault(); openAt(e, itemsFn()); },
      touchstart: (e) => {
        longFired = false;
        clearTimeout(timer);
        timer = setTimeout(() => { longFired = true; openAt(e, itemsFn()); }, 500);
      },
      touchend: () => clearTimeout(timer),
      touchmove: () => clearTimeout(timer),
    };
  }

  // Czy ostatni gest to long-press? (do tłumienia kliknięcia, np. lightboxa) — i reset.
  function consumeLongPress() { const v = longFired; longFired = false; return v; }
  function close() { ctx.value = null; }

  // Otwórz menu „normalnym" zdarzeniem (np. lewy klik przycisku).
  return { ctx, bind, open: openAt, consumeLongPress, close };
}

export default {
  props: { menu: { default: null } },
  emits: ["close"],
  setup(props, { emit }) {
    const el = ref(null);
    const close = () => emit("close");
    const onDown = (e) => { if (!el.value?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };

    watch(() => !!props.menu, (open) => {
      const m = open ? "addEventListener" : "removeEventListener";
      document[m]("mousedown", onDown, true);
      document[m]("keydown", onKey, true);
      document[m]("scroll", close, true);
      window[m]("resize", close);
    });
    onBeforeUnmount(() => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    });

    function pick(it) { it.action?.(); close(); }
    // Trzymaj menu w obrębie viewportu.
    const style = computed(() => {
      const m = props.menu;
      if (!m) return {};
      const extra = m.header ? 32 : 0;
      const left = Math.max(8, Math.min(m.x, window.innerWidth - 200));
      const top = Math.max(8, Math.min(m.y, window.innerHeight - 60 - extra - m.items.length * 40));
      return { left: left + "px", top: top + "px" };
    });
    return { el, pick, style };
  },
  template: `
    <Teleport to="body">
      <div v-if="menu" ref="el" class="ctxmenu" :style="style">
        <div v-if="menu.header" class="ctxmenu__hd">{{ menu.header }}</div>
        <button v-for="(it, i) in menu.items" :key="i"
                class="ctxmenu__item" :class="{ 'is-danger': it.danger, 'is-active': it.active }"
                @click="pick(it)">
          <span v-if="it.color" class="ctxmenu__sw" :style="{ background: it.color }"></span>
          <i v-else-if="it.icon" :class="it.icon"></i>
          <span class="ctxmenu__lbl">{{ it.label }}</span>
          <i v-if="it.active" class="ph-fill ph-check ctxmenu__check"></i>
        </button>
      </div>
    </Teleport>
  `,
};
