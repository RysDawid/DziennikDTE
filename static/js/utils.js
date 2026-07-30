// Narzędzia współdzielone: fuzzy search, formatowanie dat, kolory, daty.
import Fuse from "fuse";

/** Fuzzy filtr listy stringów/obiektów wg zapytania. */
export function fuzzy(items, query, keys = null) {
  if (!query || !query.trim()) return items;
  const fuse = new Fuse(items, {
    keys: keys || undefined,
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });
  return fuse.search(query.trim()).map((r) => r.item);
}

const DNI = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

/** ISO 'YYYY-MM-DD' -> { dow:'Piątek', dmy:'02.04.2026', iso } */
export function dayParts(iso) {
  const d = new Date(iso + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return { dow: DNI[d.getDay()], dmy: `${dd}.${mm}.${d.getFullYear()}`, iso };
}

/** Lokalny 'YYYY-MM-DD' z obiektu Date (bez przesunięcia UTC). */
function localISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Przesuń datę ISO o n dni (w czasie lokalnym). */
export function shiftDay(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localISO(d);
}

export function todayISO() {
  return localISO(new Date());
}

/** Znacznik czasu czatu: 'HH:MM DD.MM.RRRR' z ISO. */
export function chatTime(isoTs) {
  const d = new Date(isoTs);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** '#' + hex; bezpieczny fallback. */
export function asColor(hex, fallback = "#cccccc") {
  if (!hex) return fallback;
  return hex.startsWith("#") ? hex : "#" + hex;
}

/** Rozmiar pliku: bajty -> '1.2 MB' itp. */
export function formatBytes(n) {
  if (n == null || isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

// Linki rozpoznawane w treści swobodnej. Celowo wymagamy schematu albo "www.",
// żeby zwykłe fragmenty tekstu z kropką nie zmieniały się przypadkiem w URL.
const TEXT_LINK_RE = /(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s<>"']+/giu;
const LINK_TRAILING_RE = /[.,!?;:)\]}]+$/u;

export function linkHref(value) {
  const v = String(value || "").trim();
  return /^www\./i.test(v) ? `https://${v}` : v;
}

export function isWebLink(value) {
  return /^(?:https?:\/\/|ftp:\/\/|mailto:|www\.)/i.test(String(value || "").trim());
}

/** Tekst -> bezpieczne części [{ text }] / [{ text, href }], bez użycia v-html. */
export function linkifyParts(value) {
  const text = String(value || "");
  const parts = [];
  let cursor = 0;

  for (const match of text.matchAll(TEXT_LINK_RE)) {
    const start = match.index;
    let raw = match[0];
    const trailing = raw.match(LINK_TRAILING_RE)?.[0] || "";
    if (trailing) raw = raw.slice(0, -trailing.length);
    if (!raw) continue;

    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: raw, href: linkHref(raw) });
    if (trailing) parts.push({ text: trailing });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

// Jedna współdzielona sekwencja na kartę przeglądarki. Może ją uruchomić
// jednocześnie modal aktualizacji i komunikat WebSocket — oba dostaną ten sam
// Promise, więc nie powstaną dwa równoległe pollingi/przeładowania.
let hardRestartPromise = null;

/**
 * Czeka na faktycznie NOWY proces backendu (inny bootId), a następnie wykonuje
 * pełną nawigację z wersją commita w URL-u. W połączeniu z nagłówkami no-cache
 * backendu daje odpowiednik hard refresh dla kodu aplikacji.
 */
export function hardReloadAfterRestart(staryBootId, wersja, timeoutMs = 60000) {
  if (hardRestartPromise) return hardRestartPromise;

  hardRestartPromise = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      try {
        const probe = new URL("/api/bootstrap", location.origin);
        probe.searchParams.set("_restart", Date.now());
        const response = await fetch(probe, { cache: "no-store" });
        if (!response.ok) continue;
        const bootstrap = await response.json();
        if (!bootstrap.bootId || bootstrap.bootId === staryBootId) continue;

        const target = new URL(location.href);
        target.searchParams.set("_v", (wersja || bootstrap.bootId).slice(0, 12));
        location.replace(target.href);
        return true;
      } catch {
        // Serwer jest pomiędzy zatrzymaniem i ponownym uruchomieniem.
      }
    }
    hardRestartPromise = null;
    return false;
  })();

  return hardRestartPromise;
}
