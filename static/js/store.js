// Globalny reaktywny stan + klient WebSocket + autosave.
import { reactive } from "vue";
import { todayISO } from "./utils.js";

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.status === 204 ? null : res.json();
}

export const store = reactive({
  ready: false,
  bootProgress: 0, // 0-100, napędza pasek ekranu ładowania (patrz boot())
  raportLoading: false,
  today: todayISO(),
  lokacje: [],
  statusy: {}, // { serwis: [...], usterka: [...], inne: [...] }

  // Raport
  raportDate: todayISO(),
  raport: { date: todayISO(), eksponaty: {}, editable: true },
  raportHistoria: { dni: [] }, // widok historii: [{ date, stany: { klucz: stan } }]

  // Karty
  problemy: [],
  zakupy: [],
  eksploatacja: [],
  przerwa: [],
  projekty: [],
  archCount: {}, // { coll: liczba kart w archiwum } — badge na przycisku „Historia"

  // Nawigacja
  activeTab: "raport",

  // wewn.
  _ws: null,
  _saveTimers: {},
  _importing: false, // true podczas własnego POST /api/admin/import-archiwum — tłumi auto-reload z WS (patrz ImportArchiwum.js), które i tak pokaże wynik i przeładuje samo

  // --- Inicjalizacja -------------------------------------------------- //
  // Pasek postępu na ekranie ładowania: prawdziwe kroki (7 zapytań) wyznaczają
  // sufit postępu, ale wizualnie nigdy nie pokazujemy więcej niż pozwala upływ
  // czasu — intro trwa minimum MIN_MS nawet gdy dane wczytają się błyskawicznie
  // (LAN/localhost). Gdy sieć jest wolniejsza niż MIN_MS, pasek śledzi realny
  // postęp bez sztucznego czekania — nigdy nie kłamie w żadną stronę.
  async boot() {
    const started = performance.now();
    const MIN_MS = 2000;
    const TOTAL_STEPS = 7;
    let stepsDone = 0, realFrac = 0;
    const bump = () => { stepsDone++; realFrac = stepsDone / TOTAL_STEPS; };
    const timer = setInterval(() => {
      const timeCeil = Math.min(100, ((performance.now() - started) / MIN_MS) * 100);
      this.bootProgress = Math.min(realFrac * 100, timeCeil);
    }, 50);

    try {
      const b = await api("/api/bootstrap"); bump();
      this.lokacje = b.lokacje;
      this.statusy = b.statusy;
      this.today = b.today;
      this.raportDate = b.today;
      this.archCount = b.archCounts || {};
      this.problemy = await api("/api/problemy"); bump();
      this.zakupy = await api("/api/zakupy"); bump();
      this.eksploatacja = await api("/api/eksploatacja"); bump();
      this.przerwa = await api("/api/przerwa"); bump();
      this.projekty = await api("/api/projekty"); bump();
      await this.loadRaport(b.today); bump();
      this.connectWS();

      const remain = MIN_MS - (performance.now() - started);
      if (remain > 0) await new Promise((r) => setTimeout(r, remain));
      this.bootProgress = 100;
      await new Promise((r) => setTimeout(r, 220)); // chwila na "100%" zanim intro zniknie
      this.ready = true;
    } finally {
      clearInterval(timer);
    }
  },

  // --- WebSocket (realtime kolaboracja) ------------------------------- //
  connectWS() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (ev) => this._onWS(JSON.parse(ev.data));
    ws.onclose = () => setTimeout(() => this.connectWS(), 1500);
    this._ws = ws;
  },

  _onWS(msg) {
    const { channel, action, payload } = msg;
    if (channel === "system" && action === "restore") {
      // Ktoś zaimportował archiwum (data/uploads/arch podmienione na dysku) —
      // stan w pamięci tej karty jest nieaktualny, najprościej przeładować.
      // Własna karta inicjatora tłumi to (_importing) — pokazuje wynik i
      // przeładowuje się sama po zamknięciu modala.
      if (!this._importing) location.reload();
      return;
    }
    if (channel === "raport" && action === "update") {
      if (payload.date === this.raportDate) this.raport = { ...payload.data, editable: payload.date === this.today };
      return;
    }
    if (channel === "lokacje" && action === "update") {
      this.lokacje = payload.lokacje; // edycja eksponatu (zdjęcie/nazwa) → odśwież master data
      return;
    }
    if (channel === "problemy" || channel === "zakupy" || channel === "eksploatacja" || channel === "przerwa" || channel === "projekty") {
      const list = this[channel];
      if (action === "create") {
        if (!list.some((c) => c.id === payload.id)) list.unshift(payload);
      } else if (action === "update") {
        const i = list.findIndex((c) => c.id === payload.id);
        if (i >= 0) Object.assign(list[i], payload);
      } else if (action === "comment") {
        const c = list.find((x) => x.id === payload.cardId);
        if (c && !c.komentarze.some((k) => k.id === payload.komentarz.id)) c.komentarze.push(payload.komentarz);
      } else if (action === "comment-edit") {
        const c = list.find((x) => x.id === payload.cardId);
        const m = c?.komentarze.find((k) => k.id === payload.komentarz.id);
        if (m) Object.assign(m, payload.komentarz);
      } else if (action === "archive") {
        const i = list.findIndex((c) => c.id === payload.cardId);
        if (i >= 0) list.splice(i, 1);
        this._bumpArch(channel, +1); // karta przeszła do archiwum
      } else if (action === "delete") {
        const i = list.findIndex((c) => c.id === payload.cardId);
        if (i >= 0) list.splice(i, 1);
        if (payload.archiwum) this._bumpArch(channel, -1); // usunięto kartę z archiwum
      } else if (action === "restore") {
        if (!list.some((c) => c.id === payload.id)) list.unshift(payload);
        this._bumpArch(channel, -1); // karta wróciła z archiwum do aktywnych
      } else if (action === "reorder") {
        const pos = Object.fromEntries(payload.order.map((id, i) => [id, i]));
        list.sort((a, b) => (pos[a.id] ?? 1e4) - (pos[b.id] ?? 1e4));
      }
    }
  },

  // --- Raport --------------------------------------------------------- //
  async loadRaport(d) {
    this.raportDate = d;
    this.raportLoading = true;
    try {
      this.raport = await api(`/api/raport/${d}`);
    } finally {
      this.raportLoading = false;
    }
  },

  /** Historia stanów (dni wcześniejsze niż `d`) do widoku osi czasu. */
  async loadHistoria(d) {
    this.raportHistoria = await api(`/api/raport-historia?przed=${d}`);
  },

  /** Stan jednego eksponatu (klucz = "wystawaId::nazwa"). */
  eksponatRec(key) {
    if (!this.raport.eksponaty[key]) this.raport.eksponaty[key] = {};
    return this.raport.eksponaty[key];
  },

  _doSaveRaport() {
    // Pomiń puste rekordy (rec() tworzy {} przy renderze) — lżejsze archiwum.
    const eksponaty = {};
    for (const [k, v] of Object.entries(this.raport.eksponaty)) {
      if (v && Object.values(v).some((x) => x !== "" && x != null && !(Array.isArray(x) && !x.length)))
        eksponaty[k] = v;
    }
    return api(`/api/raport/${this.raportDate}`, {
      method: "PUT",
      body: JSON.stringify({ eksponaty }),
    });
  },

  /** Debounced autosave — wywoływany przy każdej zmianie pola raportu. */
  saveRaport() {
    if (!this.raport.editable) return;
    clearTimeout(this._saveTimers.raport);
    this._saveTimers.raport = setTimeout(() => this._doSaveRaport(), 450);
  },

  /** Natychmiastowy zapis (bez czekania na debounce) — używany przez przycisk
   * „Zapisz status" w karcie eksponatu, żeby dać jednoznaczne potwierdzenie zapisu. */
  async saveRaportNow() {
    if (!this.raport.editable) return;
    clearTimeout(this._saveTimers.raport);
    await this._doSaveRaport();
  },

  // --- Karty ---------------------------------------------------------- //
  async createCard(coll, data = {}) {
    const card = await api(`/api/${coll}`, { method: "POST", body: JSON.stringify(data) });
    if (!this[coll].some((c) => c.id === card.id)) this[coll].unshift(card);
    return card;
  },

  patchCard(coll, id, data) {
    const i = this[coll].findIndex((c) => c.id === id);
    if (i >= 0) Object.assign(this[coll][i], data);
    const k = `${coll}:${id}`;
    clearTimeout(this._saveTimers[k]);
    this._saveTimers[k] = setTimeout(() => {
      api(`/api/${coll}/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    }, 350);
  },

  async addComment(coll, id, tekst, autor) {
    const msg = await api(`/api/${coll}/${id}/komentarz`, {
      method: "POST",
      body: JSON.stringify({ tekst, autor }),
    });
    const c = this[coll].find((x) => x.id === id);
    if (c && !c.komentarze.some((k) => k.id === msg.id)) c.komentarze.push(msg);
  },

  async editComment(coll, cardId, msgId, tekst) {
    const msg = await api(`/api/${coll}/${cardId}/komentarz/${msgId}`, {
      method: "PATCH",
      body: JSON.stringify({ tekst }),
    });
    const c = this[coll].find((x) => x.id === cardId);
    const m = c?.komentarze.find((k) => k.id === msgId);
    if (m) Object.assign(m, msg);
  },

  /** Usuwanie miękkie — treść znika, w wątku zostaje ślad "wiadomość usunięta". */
  async deleteComment(coll, cardId, msgId) {
    const msg = await api(`/api/${coll}/${cardId}/komentarz/${msgId}`, { method: "DELETE" });
    const c = this[coll].find((x) => x.id === cardId);
    const m = c?.komentarze.find((k) => k.id === msgId);
    if (m) Object.assign(m, msg);
  },

  async archiveCard(coll, id) {
    await api(`/api/${coll}/${id}`, { method: "DELETE" });
    const i = this[coll].findIndex((c) => c.id === id);
    if (i >= 0) this[coll].splice(i, 1);
  },

  /** Twarde usunięcie — karta znika całkowicie (też z archiwum), razem z jej mediami. */
  async deleteCard(coll, id) {
    await api(`/api/${coll}/${id}/trwale`, { method: "DELETE" });
    const i = this[coll].findIndex((c) => c.id === id);
    if (i >= 0) this[coll].splice(i, 1);
  },

  /** Przeniesienie karty do innej kolekcji — znika z tej, pojawia się w docelowej (przez WS "create"). */
  async moveCard(coll, id, target) {
    await api(`/api/${coll}/${id}/przenies`, { method: "POST", body: JSON.stringify({ do: target }) });
    const i = this[coll].findIndex((c) => c.id === id);
    if (i >= 0) this[coll].splice(i, 1);
  },

  async reorder(coll, order) {
    await api(`/api/${coll}/reorder`, { method: "POST", body: JSON.stringify({ order }) });
  },

  /** Zamknięte (zarchiwizowane) karty kolekcji — dla panelu Historii. Ładowane
   * na żądanie (nie trzymamy ich w reaktywnym stanie zakładek). */
  async loadArchiwum(coll) {
    return await api(`/api/${coll}/archiwum`);
  },

  _bumpArch(coll, delta) {
    this.archCount[coll] = Math.max(0, (this.archCount[coll] || 0) + delta);
  },

  /** Przywrócenie karty z archiwum do aktywnych. Licznik/aktywna lista aktualizują
   * się przez event WS „restore" (patrz _onWS) — tu tylko optymistyczny unshift. */
  async restoreCard(coll, id) {
    const card = await api(`/api/${coll}/${id}/przywroc`, { method: "POST" });
    if (!this[coll].some((c) => c.id === card.id)) this[coll].unshift(card);
    return card;
  },

  // --- Edycja eksponatów (master data; odświeżenie przez WS „lokacje") ---- //
  async setEksponatFoto(nazwa, img) {
    await api("/api/eksponat/foto", { method: "PATCH", body: JSON.stringify({ nazwa, img }) });
  },

  async renameEksponat(wystawaId, stara, nowa) {
    await api("/api/eksponat/nazwa", {
      method: "PATCH",
      body: JSON.stringify({ wystawaId, stara, nowa }),
    });
  },
});
