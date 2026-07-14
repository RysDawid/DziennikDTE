// Galeria pełnoekranowa: główne zdjęcie + zoom (kółko/przyciski/pinch) + edytowalny opis + rolka miniatur.
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";

const MIN_Z = 1;
const MAX_Z = 5;

export default {
  props: {
    images: { type: Array, default: () => [] }, // lista URL-i
    start: { type: Number, default: 0 }, // indeks startowy
    alts: { type: Object, default: () => ({}) }, // { url: "opis" }
    editable: { type: Boolean, default: false }, // pokazuje pole opisu/alt (@alt)
    // Pokazuje przycisk usuwania (@delete) — niezależnie od 'editable', bo nie
    // wszystkie galerie (np. media w kartach modularnych) wspierają opis/alt.
    // Domyślnie = editable (dotychczasowe wywołania nie muszą się zmieniać).
    deletable: { type: Boolean, default: null },
  },
  emits: ["close", "alt", "delete"],
  setup(props, { emit }) {
    const current = ref(props.start);
    const clipEl = ref(null);

    // ---- Stan zoomu --------------------------------------------------------
    const scale = ref(1);
    const tx = ref(0);
    const ty = ref(0);
    const zoomed = computed(() => scale.value > 1.001);

    function resetZoom() { scale.value = 1; tx.value = 0; ty.value = 0; }

    // Ograniczenie przesunięcia, aby zdjęcie nie odjechało poza ramkę.
    function clampPan() {
      const el = clipEl.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const maxX = Math.max(0, (r.width * (scale.value - 1)) / 2);
      const maxY = Math.max(0, (r.height * (scale.value - 1)) / 2);
      tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
      ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
    }

    // Zoom do zadanej skali, zakotwiczony w punkcie (clientX, clientY).
    function zoomTo(target, clientX, clientY) {
      const el = clipEl.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const s2 = Math.min(MAX_Z, Math.max(MIN_Z, target));
      if (clientX == null) { clientX = cx; clientY = cy; }
      const f = s2 / scale.value;
      tx.value = clientX - cx - (clientX - cx - tx.value) * f;
      ty.value = clientY - cy - (clientY - cy - ty.value) * f;
      scale.value = s2;
      clampPan();
    }

    function zoomIn() { zoomTo(scale.value * 1.4); }
    function zoomOut() { zoomTo(scale.value / 1.4); }

    function onWheel(e) {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      zoomTo(scale.value * f, e.clientX, e.clientY);
    }

    function onDblClick(e) {
      if (zoomed.value) resetZoom();
      else zoomTo(2.5, e.clientX, e.clientY);
    }

    // ---- Przeciąganie myszą ------------------------------------------------
    let dragging = false, lastX = 0, lastY = 0;
    function onMouseMove(e) {
      if (!dragging) return;
      tx.value += e.clientX - lastX;
      ty.value += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      clampPan();
    }
    function onMouseUp() {
      dragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    function onMouseDown(e) {
      if (!zoomed.value || e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }

    // ---- Dotyk: 1 palec = przesuwanie (gdy powiększone), 2 palce = pinch ----
    let pinchStart = 0, pinchScale = 1, tLastX = 0, tLastY = 0;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        pinchStart = dist(e.touches) || 1;
        pinchScale = scale.value;
      } else if (e.touches.length === 1 && zoomed.value) {
        tLastX = e.touches[0].clientX;
        tLastY = e.touches[0].clientY;
      }
    }
    function onTouchMove(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const m = mid(e.touches);
        zoomTo(pinchScale * (dist(e.touches) / pinchStart), m.x, m.y);
      } else if (e.touches.length === 1 && zoomed.value) {
        e.preventDefault();
        const t = e.touches[0];
        tx.value += t.clientX - tLastX;
        ty.value += t.clientY - tLastY;
        tLastX = t.clientX; tLastY = t.clientY;
        clampPan();
      }
    }

    // Reset pozycji + zoomu przy każdym nowym otwarciu (zmiana listy/indeksu) i nawigacji.
    watch(
      () => [props.images, props.start],
      () => { current.value = Math.min(props.start, Math.max(0, props.images.length - 1)); resetZoom(); }
    );
    watch(current, resetZoom);

    const canDelete = computed(() => props.deletable === null ? props.editable : props.deletable);
    const open = computed(() => props.images && props.images.length > 0);
    const currentUrl = computed(() => props.images[current.value] || null);
    const currentAlt = computed({
      get: () => props.alts?.[currentUrl.value] || "",
      set: (v) => { if (currentUrl.value) emit("alt", { url: currentUrl.value, alt: v }); },
    });

    const imgStyle = computed(() => ({
      transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
      cursor: zoomed.value ? "grab" : "zoom-in",
    }));

    function go(d) {
      const n = props.images.length;
      if (!n) return;
      current.value = (current.value + d + n) % n;
    }
    function close() { emit("close"); }

    // Trwałe usunięcie aktualnie wyświetlanego zdjęcia — nieodwracalne, więc z
    // potwierdzeniem (jak inne kasujące akcje w aplikacji). Rodzic odpowiada za
    // usunięcie URL-a z listy; po usunięciu 'images' skurczy się reaktywnie i
    // powyższy watch przesunie 'current' na poprawny indeks (lub modal się zamknie,
    // gdy rodzic wyzeruje listę po usunięciu ostatniego zdjęcia).
    function deleteCurrent() {
      if (!canDelete.value || !currentUrl.value) return;
      if (!confirm("Usunąć to zdjęcie? Tej operacji nie można cofnąć.")) return;
      emit("delete", currentUrl.value);
    }

    function onKey(e) {
      if (!open.value) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-" || e.key === "_") zoomOut();
    }
    onMounted(() => document.addEventListener("keydown", onKey));
    onBeforeUnmount(() => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    });

    return {
      current, clipEl, open, currentUrl, currentAlt, go, close, deleteCurrent, canDelete,
      scale, zoomed, imgStyle, zoomIn, zoomOut, resetZoom,
      onWheel, onDblClick, onMouseDown, onTouchStart, onTouchMove,
    };
  },
  template: `
    <Teleport to="body">
      <div v-if="open" class="img-modal" @click.self="close">
        <button v-if="images.length > 1" class="img-modal__nav img-modal__nav--prev"
                @click.stop="go(-1)" aria-label="Poprzednie"><i class="ph-fill ph-caret-left"></i></button>
        <button v-if="images.length > 1" class="img-modal__nav img-modal__nav--next"
                @click.stop="go(1)" aria-label="Następne"><i class="ph-fill ph-caret-right"></i></button>

        <div class="img-modal__stage" @click.stop>
          <div class="img-modal__imgwrap">
            <div class="img-modal__clip" ref="clipEl"
                 @wheel.prevent="onWheel" @dblclick="onDblClick"
                 @mousedown="onMouseDown" @touchstart="onTouchStart" @touchmove="onTouchMove">
              <img :src="currentUrl" v-skel="currentUrl" class="img-modal__img"
                   :style="imgStyle" draggable="false" />
            </div>
            <button class="img-modal__close" @click="close" aria-label="Zamknij"><i class="ph ph-x"></i></button>
            <button v-if="canDelete" class="img-modal__del" @click="deleteCurrent" aria-label="Usuń zdjęcie" title="Usuń zdjęcie"><i class="ph-fill ph-trash"></i></button>

            <div class="img-modal__zoom" @click.stop>
              <button class="img-modal__zoom-btn" @click="zoomOut" :disabled="scale <= 1.001"
                      aria-label="Pomniejsz"><i class="ph ph-magnifying-glass-minus"></i></button>
              <button class="img-modal__zoom-pct" @click="resetZoom" title="Reset powiększenia"
                      :class="{ 'is-on': zoomed }">{{ Math.round(scale * 100) }}%</button>
              <button class="img-modal__zoom-btn" @click="zoomIn" :disabled="scale >= 4.999"
                      aria-label="Powiększ"><i class="ph ph-magnifying-glass-plus"></i></button>
            </div>
          </div>
          <div class="img-modal__alt">
            <textarea v-if="editable" v-model="currentAlt" class="img-modal__alt-inp"
                      rows="2" placeholder="Dodaj opis / alt do zdjęcia…"></textarea>
            <div v-else-if="currentAlt" class="img-modal__alt-ro">{{ currentAlt }}</div>
          </div>
        </div>

        <div v-if="images.length > 1" class="img-modal__roll" @click.stop>
          <button v-for="(img, i) in images" :key="i" type="button"
                  class="img-modal__roll-item" :class="{ 'is-active': i === current }"
                  @click="current = i">
            <img :src="img" v-skel :alt="alts?.[img] || ''" />
          </button>
        </div>
      </div>
    </Teleport>
  `,
};
