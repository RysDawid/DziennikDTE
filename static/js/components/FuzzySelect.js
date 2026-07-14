// Reużywalny dropdown z fuzzy search (wymóg: każdy dropdown ma fuzzy search).
// Popup renderowany przez <Teleport to="body"> z pozycją fixed — dzięki temu
// nie jest przycinany przez kontenery z overflow ani nie przechwytuje go
// handler kółka pasa kart (scroll listy działa natywnie).
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { fuzzy } from "../utils.js";

export default {
  props: {
    modelValue: { default: null },
    options: { type: Array, default: () => [] },
    placeholder: { type: String, default: "Wybierz…" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const open = ref(false);
    const q = ref("");
    const root = ref(null); // wrapper z przyciskiem
    const pop = ref(null); // teleportowany popup
    const btn = ref(null);
    const input = ref(null);
    const pos = reactive({ top: "0px", left: "0px", width: "0px" });

    const norm = computed(() =>
      props.options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
    );
    const selected = computed(() => norm.value.find((o) => o.value === props.modelValue) || null);
    const filtered = computed(() => fuzzy(norm.value, q.value, ["label"]));

    function place() {
      const r = btn.value?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom;
      pos.left = r.left + "px";
      pos.width = r.width + "px";
      // jeśli mało miejsca pod spodem — otwórz nad polem
      if (spaceBelow < 220 && r.top > spaceBelow) {
        pos.top = "auto";
        pos.bottom = window.innerHeight - r.top + "px";
      } else {
        pos.bottom = "auto";
        pos.top = r.bottom + "px";
      }
    }

    function toggle() {
      if (props.disabled) return;
      open.value = !open.value;
      if (open.value) {
        q.value = "";
        place();
        nextTick(() => input.value?.focus({ preventScroll: true }));
      }
    }
    function pick(o) {
      emit("update:modelValue", o.value);
      open.value = false;
    }
    function onDocClick(e) {
      if (root.value?.contains(e.target)) return;
      if (pop.value?.contains(e.target)) return;
      open.value = false;
    }
    const reposition = () => {
      if (open.value) place();
    };

    watch(open, (v) => {
      if (v) {
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("scroll", reposition, true); // capture: łapie scroll wewn. kontenerów
        window.addEventListener("resize", reposition);
      } else {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("scroll", reposition, true);
        window.removeEventListener("resize", reposition);
      }
    });
    onBeforeUnmount(() => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    });

    const displayList = computed(() => {
      if (q.value.trim()) return filtered.value.map((o) => ({ ...o, _key: o.value }));
      const result = [];
      let lastGroup = null;
      for (const item of filtered.value) {
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          result.push({ _header: true, _key: "h_" + item.group, label: item.group });
        }
        result.push({ ...item, _key: item.value });
      }
      return result;
    });

    return { open, q, root, pop, btn, input, pos, selected, filtered, displayList, toggle, pick };
  },
  template: `
    <div class="fz" :class="{ 'is-open': open, 'is-disabled': disabled }" ref="root">
      <button type="button" class="fz__btn" ref="btn" @click="toggle" :disabled="disabled">
        <span v-if="selected" class="fz__val">
          <span v-if="selected.color" class="fz__swatch" :style="{ background: selected.color }"></span>
          {{ selected.label }}
        </span>
        <span v-else class="fz__ph">{{ placeholder }}</span>
        <span class="fz__caret"><i class="ph-fill ph-caret-down"></i></span>
      </button>
      <Teleport to="body">
        <div v-if="open" class="fz__pop" ref="pop"
             :style="{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }">
          <input ref="input" v-model="q" class="fz__search" placeholder="Szukaj…" />
          <ul class="fz__list">
            <template v-for="item in displayList" :key="item._key">
              <li v-if="item._header" class="fz__group">{{ item.label }}</li>
              <li v-else class="fz__opt"
                  :class="{ 'is-sel': item.value === modelValue, 'fz__opt--sub': item.group }"
                  @click="pick(item)">
                <span v-if="item.color" class="fz__swatch" :style="{ background: item.color }"></span>
                {{ item.label }}
              </li>
            </template>
            <li v-if="!filtered.length" class="fz__empty">Brak wyników</li>
          </ul>
        </div>
      </Teleport>
    </div>
  `,
};
