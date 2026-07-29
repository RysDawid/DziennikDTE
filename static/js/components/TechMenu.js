// Menu techniczne — ukryte pod logo, odblokowywane hasłem (DTE_ADMIN_HASLO na
// serwerze). Za bramką: import archiwum i aktualizacja kodu. Hasło raz
// wpisane trzyma się w sessionStorage (do zamknięcia karty przeglądarki), nie
// trzeba wpisywać go przy każdym otwarciu w tej samej sesji.
import { ref } from "vue";
import ImportArchiwum from "./ImportArchiwum.js";
import GitUpdate from "./GitUpdate.js";

const HASLO_KEY = "dte-admin-haslo";

export default {
  components: { ImportArchiwum, GitUpdate },
  emits: ["close"],
  setup(_, { emit }) {
    const haslo = ref(sessionStorage.getItem(HASLO_KEY) || "");
    const odblokowane = ref(!!haslo.value);
    const wpisane = ref("");
    const blad = ref("");
    const sprawdzam = ref(false);
    const importOpen = ref(false);
    const updateOpen = ref(false);

    async function odblokuj() {
      if (!wpisane.value) return;
      sprawdzam.value = true;
      blad.value = "";
      try {
        const res = await fetch("/api/admin/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ haslo: wpisane.value }),
        });
        if (!res.ok) throw new Error("Złe hasło.");
        haslo.value = wpisane.value;
        sessionStorage.setItem(HASLO_KEY, wpisane.value);
        odblokowane.value = true;
      } catch (e) {
        blad.value = e.message || "Nie udało się zweryfikować hasła.";
      } finally {
        sprawdzam.value = false;
      }
    }

    return {
      haslo, odblokowane, wpisane, blad, sprawdzam, importOpen, updateOpen,
      odblokuj, close: () => emit("close"),
    };
  },
  template: `
  <Teleport to="body">
    <div class="mu-overlay" @mousedown.self="close">
      <div class="mu-dialog" style="width:min(360px,94vw)">
        <div class="mu-hd">
          <span class="mu-title">Ustawienia techniczne</span>
          <button class="mu-close" @click="close"><i class="ph-fill ph-x"></i></button>
        </div>

        <template v-if="!odblokowane">
          <div class="techmenu__passrow">
            <i class="ph ph-lock-key"></i>
            <input type="password" v-model="wpisane" placeholder="Hasło"
                   autofocus @keyup.enter="odblokuj" />
          </div>
          <div v-if="blad" class="mu-note mu-note--danger">{{ blad }}</div>
          <div class="mu-foot">
            <button class="mu-btn mu-btn--cancel" @click="close">Anuluj</button>
            <button class="mu-btn mu-btn--upload" :disabled="!wpisane || sprawdzam" @click="odblokuj">
              {{ sprawdzam ? 'Sprawdzam…' : 'Odblokuj' }}
            </button>
          </div>
        </template>

        <template v-else>
          <div class="techmenu__list">
            <button class="techmenu__item" @click="importOpen = true">
              <i class="ph-fill ph-database"></i> Import archiwum
            </button>
            <button class="techmenu__item" @click="updateOpen = true">
              <i class="ph-fill ph-cloud-arrow-down"></i> Aktualizuj kod
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
  <ImportArchiwum v-if="importOpen" :haslo="haslo" @close="importOpen = false" />
  <GitUpdate v-if="updateOpen" :haslo="haslo" @close="updateOpen = false" />
  `,
};
