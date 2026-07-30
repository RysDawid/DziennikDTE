// Modal admina: pobiera najnowszy kod z gita (git pull --ff-only) i, jeśli coś
// się zmieniło, serwer wykonuje twardy restart (wymaga Restart=always w systemd
// — patrz /api/admin/aktualizuj w main.py). Klient czeka na nowy bootId i robi
// pełne przeładowanie kodu z pominięciem starego cache'u.
import { ref } from "vue";
import { hardReloadAfterRestart } from "../utils.js";

export default {
  props: { haslo: { type: String, required: true } },
  emits: ["close"],
  setup(props, { emit }) {
    const busy = ref(false);
    const result = ref(null); // { zmieniono, output, restartuje }
    const error = ref("");
    const restartowanie = ref(false);
    const restartNieudany = ref(false);

    async function czekajNaRestart(staryBootId, wersja) {
      restartowanie.value = true;
      const gotowy = await hardReloadAfterRestart(staryBootId, wersja);
      if (!gotowy) {
        restartowanie.value = false;
        restartNieudany.value = true;
        error.value =
          "Kod został pobrany, ale nowa instancja serwera nie uruchomiła się " +
          "w ciągu 60 sekund. Sprawdź usługę i wykonaj twarde odświeżenie strony.";
      }
    }

    async function run() {
      if (!confirm(
        "To pobierze najnowszy kod. Jeśli będą zmiany, serwer się ZRESTARTUJE\n" +
        "(kilka sekund przerwy w działaniu dla wszystkich podłączonych).\n\n" +
        "Kontynuować?"
      )) return;

      busy.value = true;
      error.value = "";
      restartNieudany.value = false;
      result.value = null;
      try {
        const res = await fetch("/api/admin/aktualizuj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ haslo: props.haslo }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || `Błąd ${res.status}`);
        result.value = body;
        if (body.restartuje) czekajNaRestart(body.bootId, body.wersja);
      } catch (e) {
        error.value = e.message || "Aktualizacja nie powiodła się.";
      } finally {
        busy.value = false;
      }
    }

    return { busy, result, error, restartowanie, restartNieudany, run, close: () => emit("close") };
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
          <span class="mu-drop__hint">jeśli będą zmiany — serwer się sam zrestartuje</span>
        </div>

        <div v-if="error" class="mu-note mu-note--danger" style="white-space:pre-wrap">{{ error }}</div>
        <div v-if="result" class="mu-note" :class="result.zmieniono ? 'mu-note--ok' : ''">
          <template v-if="restartowanie">Zaktualizowano — czekam na nowy proces i twarde przeładowanie…</template>
          <template v-else-if="restartNieudany">Kod pobrany — restart nie został potwierdzony.</template>
          <template v-else-if="result.zmieniono">Zaktualizowano i zrestartowano.</template>
          <template v-else>Już aktualne — brak nowych commitów.</template>
          <pre v-if="result.output" style="white-space:pre-wrap;margin:8px 0 0;font-size:11px;opacity:.75">{{ result.output }}</pre>
        </div>

        <div class="mu-foot">
          <button class="mu-btn mu-btn--cancel" @click="close" :disabled="restartowanie">Zamknij</button>
          <button class="mu-btn mu-btn--upload" :disabled="busy || restartowanie" @click="run">
            {{ busy ? 'Pobieram…' : restartowanie ? 'Twardy restart…' : 'Sprawdź aktualizacje' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  `,
};
