// Modal uploadu mediów: drag-and-drop + file picker + podgląd miniatur + wgrywanie.
// Emit: 'uploaded' z tablicą URL-i, 'close' po anulowaniu.
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

export default {
  props: {
    open:    { type: Boolean, default: false },
    kontekst:{ type: String,  required: true },
    ownerId: { type: String,  required: true },
  },
  emits: ["uploaded", "close"],
  setup(props, { emit }) {
    const files = ref([]);
    const previews = ref([]);
    const uploading = ref(false);
    const dragover = ref(false);

    function addFiles(list) {
      for (const f of list) {
        if (!f.type.startsWith("image/")) continue;
        files.value.push(f);
        const reader = new FileReader();
        reader.onload = (e) => previews.value.push({ name: f.name, src: e.target.result });
        reader.readAsDataURL(f);
      }
    }

    function onInput(e) {
      addFiles(e.target.files);
      e.target.value = "";
    }

    function onDrop(e) {
      dragover.value = false;
      addFiles(e.dataTransfer.files);
    }

    // Wklejanie ze schowka (Ctrl+V) — działa gdziekolwiek na stronie, dopóki modal jest otwarty.
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) { e.preventDefault(); addFiles(imgs); }
    }
    onMounted(() => document.addEventListener("paste", onPaste));
    onBeforeUnmount(() => document.removeEventListener("paste", onPaste));

    function removeFile(i) {
      files.value.splice(i, 1);
      previews.value.splice(i, 1);
    }

    async function upload() {
      if (!files.value.length) return;
      uploading.value = true;
      try {
        const fd = new FormData();
        files.value.forEach((f, i) => fd.append(`f${i}`, f));
        const res = await fetch(`/api/upload/${props.kontekst}/${props.ownerId}`, {
          method: "POST",
          body: fd,
        });
        const { urls } = await res.json();
        emit("uploaded", urls);
        files.value = [];
        previews.value = [];
      } finally {
        uploading.value = false;
      }
    }

    function close() {
      files.value = [];
      previews.value = [];
      emit("close");
    }

    return { files, previews, uploading, dragover, addFiles, onInput, onDrop, removeFile, upload, close };
  },
  template: `
  <Teleport to="body">
    <div v-if="open" class="mu-overlay" @mousedown.self="close">
      <div class="mu-dialog">
        <div class="mu-hd">
          <span class="mu-title">Dodaj media</span>
          <button class="mu-close" @click="close"><i class="ph-fill ph-x"></i></button>
        </div>

        <div
          class="mu-drop"
          :class="{ 'is-over': dragover }"
          @dragover.prevent="dragover = true"
          @dragleave="dragover = false"
          @drop.prevent="onDrop"
        >
          <span class="mu-drop__ico"><i class="ph-fill ph-camera"></i></span>
          <span class="mu-drop__lbl">Przeciągnij zdjęcia lub</span>
          <label class="mu-pick">
            wybierz pliki
            <input type="file" accept="image/*" multiple hidden @change="onInput" />
          </label>
          <label class="mu-pick mu-pick--camera">
            aparat
            <input type="file" accept="image/*" capture="environment" hidden @change="onInput" />
          </label>
          <span class="mu-drop__hint">lub wklej ze schowka — Ctrl+V</span>
        </div>

        <div v-if="previews.length" class="mu-previews">
          <div v-for="(p, i) in previews" :key="i" class="mu-thumb">
            <img :src="p.src" :alt="p.name" />
            <button class="mu-thumb__rm" @click="removeFile(i)"><i class="ph-fill ph-x"></i></button>
          </div>
        </div>

        <div class="mu-foot">
          <button class="mu-btn mu-btn--cancel" @click="close">Anuluj</button>
          <button
            class="mu-btn mu-btn--upload"
            :disabled="!files.length || uploading"
            @click="upload"
          >
            {{ uploading ? 'Wgrywam…' : 'Wgraj ' + (files.length ? '(' + files.length + ')' : '') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  `,
};
