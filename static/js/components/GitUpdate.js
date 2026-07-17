// Modal admina: pobiera najnowszy kod z gita (git pull --ff-only). NIE
// restartuje serwera — na tym etapie appka nie zakłada nadzorcy procesu
// (systemd) na serwerze, więc po pobraniu trzeba ręcznie zrestartować, żeby
// nowy kod zaczął działać (patrz /api/admin/aktualizuj w main.py).
import { ref } from "vue";

export default {
  emits: ["close"],
  setup(_, { emit }) {
    const busy = ref(false);
    const result = ref(null); // { zmieniono, output }
    const error = ref("");

    async function run() {
      busy.value = true;
      error.value = "";
      result.value = null;
      try {
        const res = await fetch("/api/admin/aktualizuj", { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || `Błąd ${res.status}`);
        result.value = body;
      } catch (e) {
        error.value = e.message || "Aktualizacja nie powiodła się.";
      } finally {
        busy.value = false;
      }
    }

    return { busy, result, error, run, close: () => emit("close") };
  },
  template: `
  <Teleport to="body">
    <div class="mu-overlay" @mousedown.self="close">
      <div class="mu-dialog">
        <div class="mu-hd">
          <span class="mu-title">Aktualizacja kodu</span>
          <button class="mu-close" @click="close"><i class="ph-fill ph-x"></i></button>
        </div>

        <div class="mu-drop" style="margin-bottom:0">
          <span class="mu-drop__ico"><i class="ph-fill ph-cloud-arrow-down"></i></span>
          <span class="mu-drop__lbl">Pobierz najnowszy kod z repozytorium (git pull)</span>
          <span class="mu-drop__hint">to tylko pobiera zmiany — nie restartuje serwera</span>
        </div>

        <div v-if="error" class="mu-note mu-note--danger" style="white-space:pre-wrap">{{ error }}</div>
        <div v-if="result" class="mu-note" :class="result.zmieniono ? 'mu-note--ok' : ''">
          <template v-if="result.zmieniono">
            Pobrano nowy kod. <strong>Poproś admina o restart serwera</strong>, żeby zaczął działać.
          </template>
          <template v-else>Już aktualne — brak nowych commitów.</template>
          <pre v-if="result.output" style="white-space:pre-wrap;margin:8px 0 0;font-size:11px;opacity:.75">{{ result.output }}</pre>
        </div>

        <div class="mu-foot">
          <button class="mu-btn mu-btn--cancel" @click="close">Zamknij</button>
          <button class="mu-btn mu-btn--upload" :disabled="busy" @click="run">
            {{ busy ? 'Pobieram…' : 'Sprawdź aktualizacje' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  `,
};
