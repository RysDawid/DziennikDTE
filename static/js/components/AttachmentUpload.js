// Modal uploadu załączników: dowolne pliki (nie tylko zdjęcia) — drag-and-drop +
// file picker, lista wybranych plików (nazwa + rozmiar, bez podglądu miniatur, bo
// pliki nie muszą być obrazami), wgrywanie przez ten sam endpoint co media.
// Emit: 'uploaded' z tablicą { url, nazwa, rozmiar }, 'close' po anulowaniu.
import { ref } from "vue";
import { formatBytes } from "../utils.js";

export default {
  props: {
    open:    { type: Boolean, default: false },
    kontekst:{ type: String,  required: true },
    ownerId: { type: String,  required: true },
  },
  emits: ["uploaded", "close"],
  setup(props, { emit }) {
    const files = ref([]);
    const uploading = ref(false);
    const dragover = ref(false);

    function addFiles(list) {
      for (const f of list) files.value.push(f);
    }
    function onInput(e) {
      addFiles(e.target.files);
      e.target.value = "";
    }
    function onDrop(e) {
      dragover.value = false;
      addFiles(e.dataTransfer.files);
    }
    function removeFile(i) { files.value.splice(i, 1); }

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
        // Serwer zwraca URL-e w kolejności wysyłki — zestawiamy je z oryginalnymi
        // plikami, żeby zachować prawdziwą nazwę/rozmiar (URL ma losowy prefiks).
        const items = urls.map((url, i) => ({
          url,
          nazwa: files.value[i]?.name || url.split("/").pop(),
          rozmiar: files.value[i]?.size ?? null,
        }));
        emit("uploaded", items);
        files.value = [];
      } finally {
        uploading.value = false;
      }
    }

    function close() {
      files.value = [];
      emit("close");
    }

    return { files, uploading, dragover, onInput, onDrop, removeFile, upload, close, formatBytes };
  },
  template: `
  <Teleport to="body">
    <div v-if="open" class="mu-overlay" @mousedown.self="close">
      <div class="mu-dialog">
        <div class="mu-hd">
          <span class="mu-title">Dodaj załącznik</span>
          <button class="mu-close" @click="close"><i class="ph-fill ph-x"></i></button>
        </div>

        <div
          class="mu-drop"
          :class="{ 'is-over': dragover }"
          @dragover.prevent="dragover = true"
          @dragleave="dragover = false"
          @drop.prevent="onDrop"
        >
          <span class="mu-drop__ico"><i class="ph-fill ph-paperclip"></i></span>
          <span class="mu-drop__lbl">Przeciągnij pliki lub</span>
          <label class="mu-pick">
            wybierz pliki
            <input type="file" multiple hidden @change="onInput" />
          </label>
          <span class="mu-drop__hint">dowolny format — dokumenty, arkusze, PDF-y…</span>
        </div>

        <div v-if="files.length" class="mu-filelist">
          <div v-for="(f, i) in files" :key="i" class="mu-file">
            <i class="mu-file__ico ph-fill ph-file"></i>
            <span class="mu-file__name">{{ f.name }}</span>
            <span class="mu-file__size">{{ formatBytes(f.size) }}</span>
            <button class="mu-file__rm" @click="removeFile(i)" title="Usuń z listy"><i class="ph-fill ph-x"></i></button>
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
