// TAB — Projekty. Karty modularne, identyczne funkcjonalnie jak Przerwa techniczna
// (patrz PrzerwaTechniczna.js) — logika współdzielona przez useModularTab.
import ModularCard from "../components/ModularCard.js";
import ContextMenu from "../components/ContextMenu.js";
import HistoryPanel from "../components/HistoryPanel.js";
import { useModularTab } from "./modularTab.js";

export default {
  components: { ModularCard, ContextMenu, HistoryPanel },
  setup() {
    return useModularTab("projekty", { newTitle: "Nowy projekt", addLabel: "Projekt" });
  },
  template: `
  <div class="cardtab">
    <header class="cardtab__bar">
      <button
        v-for="s in STATUSY_MODULAR" :key="s.v"
        class="prio-btn" :class="['prio-btn--' + s.cls, { 'is-active': activeStatus === s.v }]"
        @click="activeStatus = (activeStatus === s.v ? null : s.v)"
      >{{ s.label }}</button>
      <button class="prio-add" @click="addCardMenu($event)" title="Dodaj projekt"><i class="ph-fill ph-plus"></i></button>
      <button class="hist-btn" :class="{ 'is-active': historyOpen }" @click="toggleHistory" title="Historia zamkniętych kart">
        <i class="ph-fill ph-clock-counter-clockwise"></i><span>Historia</span>
        <span v-if="archCount" class="hist-btn__badge">{{ archCount }}</span>
      </button>
    </header>

    <div class="cardtab__main">
    <div class="cardtab__strip" ref="stripEl" @wheel="onWheel">
      <ModularCard
        v-for="c in filtered" :key="c.id" :data-id="c.id"
        :coll="coll" :card="c" @open-fullscreen="openFullscreen" @archive="archiveCard" @delete="deleteCard"
      />

      <div v-if="isEmpty" class="karta karta--add" @click="addCard(null)">
        <span class="karta-add__plus"><i class="ph-fill ph-plus"></i></span>
        <span class="karta-add__lbl">Dodaj<br>{{ addLabel }}</span>
      </div>
    </div>
    <HistoryPanel :coll="coll" :open="historyOpen" :refresh="archRefresh" @close="historyOpen = false" />
    </div><!-- /cardtab__main -->

    <Teleport to="body">
      <div v-if="fullscreenCard" class="pcard-overlay" @click.self="closeFullscreen">
        <ModularCard :coll="coll" :card="fullscreenCard" fullscreen @close-fullscreen="closeFullscreen"
                     @archive="c => { archiveCard(c); closeFullscreen(); }"
                     @delete="c => { deleteCard(c); closeFullscreen(); }" />
      </div>
    </Teleport>
    <ContextMenu :menu="ctxMenu" @close="ctxClose" />
  </div>
  `,
};
