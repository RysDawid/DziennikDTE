// TAB 2 — Problemy. Karty problemów: drag-reorder, galeria, chat, archiwizacja.
// Logika współdzielona z Zakupami → useCardTab (patrz cardTab.js).
import { useCardTab } from "./cardTab.js";
import FuzzySelect from "../components/FuzzySelect.js";
import MediaUpload from "../components/MediaUpload.js";
import AttachmentUpload from "../components/AttachmentUpload.js";
import ImageModal from "../components/ImageModal.js";
import ContextMenu from "../components/ContextMenu.js";
import HistoryPanel from "../components/HistoryPanel.js";

export default {
  components: { FuzzySelect, MediaUpload, AttachmentUpload, ImageModal, ContextMenu, HistoryPanel },
  setup() {
    return useCardTab("problemy", { newTitle: "Nowy problem" });
  },
  template: `
  <div class="cardtab">
    <header class="cardtab__bar">
      <button
        v-for="p in PRIO" :key="p.v"
        class="prio-btn" :class="['prio-btn--' + p.v, { 'is-active': activePrio === p.v }]"
        @click="activePrio = (activePrio === p.v ? null : p.v)"
      >{{ p.label }}</button>
      <button class="prio-add" @click="addCardMenu($event)" title="Dodaj problem"><i class="ph-fill ph-plus"></i></button>
      <button class="hist-btn" :class="{ 'is-active': historyOpen }" @click="toggleHistory" title="Historia zamkniętych kart">
        <i class="ph-fill ph-clock-counter-clockwise"></i><span>Historia</span>
        <span v-if="archCount" class="hist-btn__badge">{{ archCount }}</span>
      </button>
    </header>

    <div class="cardtab__main">
    <div class="cardtab__strip" ref="stripEl" @wheel="onWheel">

      <article
        v-for="c in filtered" :key="c.id"
        class="karta" :data-id="c.id"
        :style="{ '--prio': prioHex(c.priorytet) }"
      >
        <!-- Nagłówek: pasek neutralny; kolor priorytetu na pasku u góry karty -->
        <div class="karta__head">
          <button class="karta__ico-status" @click.stop="ctxOpen($event, prioItems(c))" title="Zmień priorytet"><i class="ph-fill ph-flag"></i></button>
          <input
            class="karta__title"
            v-livemodel="c.tytul"
            @change="e => patchCard(c.id, { tytul: e.target.value })"
          />
          <span class="drag-handle" title="Przeciągnij, aby zmienić kolejność"></span>
        </div>

        <div class="karta__body">

          <!-- Lokalizacja -->
          <div class="krow">
            <span class="krow__ico"><i class="ph-fill ph-map-pin"></i></span>
            <div class="krow__cnt">
              <FuzzySelect
                :model-value="c.lokalizacja"
                :options="lokOptions"
                placeholder="Lokalizacja…"
                @update:modelValue="v => patchCard(c.id, { lokalizacja: v })"
              />
            </div>
          </div>

          <!-- Galeria / zdjęcia — dodawanie mediów przez menu flagi ("Dodaj media"),
               nie przez stały przycisk. Układ: 1 zdjęcie = duże; 2 = obok siebie;
               3+ = duże + reszta małe. -->
          <div v-if="c.zdjecia?.length" class="krow">
            <span class="krow__ico" style="margin-top:6px"><i class="ph-fill ph-camera"></i></span>
            <div class="krow__cnt karta__gallery">
              <div v-if="c.zdjecia.length === 2" class="karta__gallery-pair">
                <img v-for="(z,i) in c.zdjecia" :key="i" v-skel :src="z" @click="openLightbox(c, i)" />
              </div>
              <template v-else>
                <img class="karta__gallery-main" v-skel="c.zdjecia[0]" :src="c.zdjecia[0]"
                     @click="openLightbox(c, 0)" />
                <div v-if="c.zdjecia.length > 1" class="karta__thumbs">
                  <img v-for="(z,i) in c.zdjecia.slice(1)" :key="i" v-skel :src="z"
                       @click="openLightbox(c, i + 1)" />
                </div>
              </template>
            </div>
          </div>

          <MediaUpload
            v-if="mediaCardId === c.id"
            :open="true"
            kontekst="problemy"
            :owner-id="c.id"
            @uploaded="urls => onMediaUploaded(c, urls)"
            @close="mediaCardId = null"
          />

          <!-- Załączniki — dowolne pliki, dodawane przez menu flagi ("Dodaj załącznik").
               Prawy klik / przytrzymaj na pliku → usuń. -->
          <div v-if="c.zalaczniki?.length" class="krow">
            <span class="krow__ico"><i class="ph-fill ph-paperclip"></i></span>
            <div class="krow__cnt attach-list">
              <div v-for="a in c.zalaczniki" :key="a.url" class="attach-item"
                   v-on="ctxBind(() => attachMenuItems(c, a))" title="Prawy klik / przytrzymaj → usuń">
                <i class="attach-item__ico ph-fill ph-file"></i>
                <span class="attach-item__name">{{ a.nazwa }}</span>
                <span class="attach-item__size">{{ formatBytes(a.rozmiar) }}</span>
                <a class="attach-item__dl" :href="a.url" :download="a.nazwa" @click.stop title="Pobierz"><i class="ph-fill ph-download-simple"></i></a>
              </div>
            </div>
          </div>

          <AttachmentUpload
            v-if="attachCardId === c.id"
            :open="true"
            kontekst="problemy"
            :owner-id="c.id"
            @uploaded="items => onAttachUploaded(c, items)"
            @close="attachCardId = null"
          />

          <!-- Opis -->
          <div class="krow">
            <span class="krow__ico"><i class="ph-fill ph-info"></i></span>
            <div class="krow__cnt">
              <textarea
                class="karta__opis"
                v-autogrow="c.opis"
                v-spellfocus
                v-livemodel="c.opis"
                placeholder="Opis problemu…"
                @input="e => patchCard(c.id, { opis: e.target.value })"
              ></textarea>
            </div>
          </div>

          <!-- Chat: ta sama struktura co inne wiersze — ikona po lewej, treść po prawej -->
          <div class="krow karta__chat">
            <span class="krow__ico" title="Chat"><i class="ph-fill ph-chat-circle-text"></i></span>
            <div class="krow__cnt">
              <div v-if="c.komentarze?.length" class="chat-msgs" :data-msgs="c.id">
                <div
                  v-for="m in (c.komentarze || [])" :key="m.id"
                  class="chat-msg" :class="'chat-msg--' + m.autor"
                >
                  <div v-if="editMsg && editMsg.cardId === c.id && editMsg.msgId === m.id" class="chat-edit">
                    <input class="chat-edit__inp" :data-edit="c.id + ':' + m.id" v-model="editMsgText"
                           @keydown.enter.prevent="commitEditMsg" @keydown.esc="cancelEditMsg" />
                    <button class="chat-edit__btn chat-edit__btn--ok" @click="commitEditMsg" title="Zapisz"><i class="ph-fill ph-check"></i></button>
                    <button class="chat-edit__btn chat-edit__btn--cancel" @click="cancelEditMsg" title="Anuluj"><i class="ph-fill ph-x"></i></button>
                  </div>
                  <template v-else>
                    <div class="chat-bubble" :class="{ 'chat-bubble--deleted': m.usunieta }"
                         v-on="ctxBind(() => msgItems(c, m))"
                         :title="m.usunieta ? '' : 'Prawy klik / przytrzymaj → edytuj'">
                      <span v-if="m.usunieta" class="chat-deleted-lbl"><i class="ph ph-prohibit"></i> Wiadomość usunięta</span>
                      <template v-else>{{ m.tekst }}</template>
                    </div>
                    <div class="chat-ts">{{ chatTime(m.ts) }}<span v-if="m.editedAt && !m.usunieta" class="chat-edited"> · edytowano {{ chatTime(m.editedAt) }}</span></div>
                  </template>
                </div>
              </div>
              <div class="chat-reply">
                <input
                  class="chat-input"
                  v-model="replyText[c.id]"
                  placeholder="Napisz wiadomość lub status"
                  @keydown.enter.prevent="openSendMenu(c, $event)"
                />
                <button class="chat-send" @click="openSendMenu(c, $event)"><i class="ph-fill ph-paper-plane-right"></i></button>
              </div>
            </div>
          </div>

        </div><!-- /karta__body -->

        <div class="karta__footer">
          <button class="btn-final" @click="archiveCard(c)">Problem rozwiązany</button>
        </div>
      </article>

      <!-- Placeholder: nowy problem — tylko gdy w kolekcji nie ma jeszcze żadnej karty (jest już mały "+" przy filtrach) -->
      <div v-if="isEmpty" class="karta karta--add" @click="addCard()">
        <span class="karta-add__plus"><i class="ph-fill ph-plus"></i></span>
        <span class="karta-add__lbl">Dodaj<br>Problem</span>
      </div>

    </div>
    <HistoryPanel :coll="coll" :open="historyOpen" :refresh="archRefresh" @close="historyOpen = false" />
    </div><!-- /cardtab__main -->
    <ImageModal
      :images="lightboxImages"
      :start="lightbox?.start || 0"
      :alts="lightboxAlts"
      :editable="true"
      @alt="onLightboxAlt"
      @delete="onLightboxDelete"
      @close="lightbox = null"
    />
    <ContextMenu :menu="ctxMenu" @close="ctxClose" />
  </div>
  `,
};
