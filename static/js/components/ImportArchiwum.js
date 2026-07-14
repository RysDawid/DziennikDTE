// Modal admina: wgrywanie zipa z kopią zapasową (data/uploads/arch), żeby
// odtworzyć dane produkcyjne na instalacji, która ma puste te katalogi (bo
// nie są w gicie — patrz .gitignore). Backend przenosi bieżącą zawartość do
// _backup/ zamiast ją kasować (patrz /api/admin/import-archiwum w main.py).
import { ref } from "vue";
import { store } from "../store.js";

export default {
  emits: ["close"],
  setup(_, { emit }) {
    const file = ref(null);
    const busy = ref(false);
    const result = ref(null); // { zaimportowano, plikow, backup }
    const error = ref("");

    function onPick(e) {
      file.value = e.target.files[0] || null;
      e.target.value = "";
      result.value = null;
      error.value = "";
    }

    async function run() {
      if (!file.value) return;
      if (!confirm(
        "To nadpisze bieżące dane (data/uploads/arch) zawartością archiwum.\n" +
        "Poprzednia zawartość zostanie przeniesiona do _backup/, nie skasowana.\n\n" +
        "Kontynuować import?"
      )) return;

      busy.value = true;
      error.value = "";
      store._importing = true;
      try {
        const fd = new FormData();
        fd.append("plik", file.value);
        const res = await fetch("/api/admin/import-archiwum", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || `Błąd ${res.status}`);
        result.value = body;
        file.value = null;
      } catch (e) {
        error.value = e.message || "Import nie powiódł się.";
      } finally {
        busy.value = false;
        store._importing = false;
      }
    }

    function close() {
      // Po udanym imporcie dane w pamięci innych zakładek/przeglądarek są
      // nieaktualne (przeładowanie in-place obsłużyłby WS, ale najprościej
      // i najpewniej jest po prostu przeładować stronę u siebie też).
      if (result.value) location.reload();
      else emit("close");
    }

    return { file, busy, result, error, onPick, run, close };
  },
  template: `
  <Teleport to="body">
    <div class="mu-overlay" @mousedown.self="close">
      <div class="mu-dialog">
        <div class="mu-hd">
          <span class="mu-title">Import archiwum</span>
          <button class="mu-close" @click="close"><i class="ph-fill ph-x"></i></button>
        </div>

        <div class="mu-drop" style="margin-bottom:0">
          <span class="mu-drop__ico"><i class="ph-fill ph-database"></i></span>
          <span class="mu-drop__lbl">Wgraj plik .zip z kopią zapasową</span>
          <label class="mu-pick">
            wybierz plik
            <input type="file" accept=".zip" hidden @change="onPick" />
          </label>
          <span class="mu-drop__hint">archiwum musi zawierać w korzeniu foldery data/, uploads/ i/lub arch/</span>
        </div>

        <div v-if="file" class="mu-filelist">
          <div class="mu-file">
            <i class="mu-file__ico ph-fill ph-file-zip"></i>
            <span class="mu-file__name">{{ file.name }}</span>
          </div>
        </div>

        <div v-if="error" class="mu-note mu-note--danger">{{ error }}</div>
        <div v-if="result" class="mu-note mu-note--ok">
          Zaimportowano: {{ result.zaimportowano.join(', ') }} ({{ result.plikow }} plików).
          <span v-if="result.backup">Poprzednie dane: {{ result.backup }}.</span>
          Zamknij, żeby przeładować aplikację ze świeżymi danymi.
        </div>

        <div class="mu-foot">
          <button class="mu-btn mu-btn--cancel" @click="close">{{ result ? 'Przeładuj' : 'Anuluj' }}</button>
          <button
            v-if="!result"
            class="mu-btn mu-btn--upload"
            :disabled="!file || busy"
            @click="run"
          >
            {{ busy ? 'Importuję…' : 'Importuj' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  `,
};
