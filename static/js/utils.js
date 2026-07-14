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
