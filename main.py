"""
DTE — Dziennik Techniczno-Eksploatacyjny CNE
Backend: FastAPI + WebSocket hub + storage w plikach JSON.

Uruchomienie (dev):
    pip install -r requirements.txt
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import unicodedata
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import Body, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from starlette.datastructures import UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# --------------------------------------------------------------------------- #
# Ścieżki
# --------------------------------------------------------------------------- #
BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
IMG = BASE / "img"
STATIC = BASE / "static"
ARCH = BASE / "arch"
UPLOADS = BASE / "uploads"

for d in (ARCH, UPLOADS):
    d.mkdir(parents=True, exist_ok=True)

LOKACJE_FILE = DATA / "lokacje.json"
STATUSY_FILE = DATA / "statusy.json"
IMG_MAP_FILE = DATA / "eksponaty_img.json"
PROBLEMY_FILE = DATA / "problemy.json"
ZAKUPY_FILE = DATA / "zakupy.json"
EKSPLOATACJA_FILE = DATA / "eksploatacja.json"
PRZERWA_FILE = DATA / "przerwa.json"
PROJEKTY_FILE = DATA / "projekty.json"

# --------------------------------------------------------------------------- #
# Pomocnicze: I/O JSON
# --------------------------------------------------------------------------- #
def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


# --------------------------------------------------------------------------- #
# Mapowanie nazw eksponatów -> pliki zdjęć (fuzzy seed + ręczny override)
# Patrz: img names NIE mapują się 1:1 z lokacje.json.
# --------------------------------------------------------------------------- #
def _norm_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def build_image_map(lokacje: list[dict]) -> dict[str, str | None]:
    """Zwraca {nazwa_eksponatu: 'wystawa/plik.jpg' | None}. Seed fuzzy +
    nadrzędny ręczny plik data/eksponaty_img.json."""
    wystawa_dir = IMG / "wystawa"
    files = (
        [f.name for f in wystawa_dir.iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png")]
        if wystawa_dir.exists()
        else []
    )
    file_keys = {f: _norm_key(Path(f).stem) for f in files}

    def best(name: str) -> str | None:
        nk = _norm_key(name)
        if not nk:
            return None
        for f, k in file_keys.items():
            if k == nk:
                return f
        # podłańcuch w obie strony (pewne)
        for f, k in file_keys.items():
            if len(nk) >= 4 and (nk in k or k in nk):
                return f
        # fuzzy z wysokim progiem (ostrożnie — możliwe fałszywe trafienia)
        best_f, best_r = None, 0.0
        for f, k in file_keys.items():
            r = SequenceMatcher(None, nk, k).ratio()
            if r > best_r:
                best_f, best_r = f, r
        return best_f if best_r >= 0.86 else None

    names: list[str] = []
    for lok in lokacje:
        for sub in lok.get("pod_lokalizacje", []):
            names.extend(sub.get("eksponaty", []))

    seed = {n: (f"wystawa/{best(n)}" if best(n) else None) for n in names}

    # Override ręczny: jeśli plik istnieje, scal (jego wartości wygrywają).
    override = load_json(IMG_MAP_FILE, None)
    if override is None:
        save_json(IMG_MAP_FILE, seed)  # seed na dysk do ręcznej korekty
        return seed
    merged = dict(seed)
    merged.update(override)
    return merged


# --------------------------------------------------------------------------- #
# Stan w pamięci
# --------------------------------------------------------------------------- #
LOKACJE: list[dict] = load_json(LOKACJE_FILE, [])
# Statusy pogrupowane wg stanu eksponatu: {"serwis": [...], "usterka": [...], "inne": [...]}
STATUSY: dict[str, list[str]] = load_json(STATUSY_FILE, {})
IMG_MAP: dict[str, str | None] = build_image_map(LOKACJE)

PROBLEMY: list[dict] = load_json(PROBLEMY_FILE, [])
ZAKUPY: list[dict] = load_json(ZAKUPY_FILE, [])
EKSPLOATACJA: list[dict] = load_json(EKSPLOATACJA_FILE, [])
PRZERWA: list[dict] = load_json(PRZERWA_FILE, [])
PROJEKTY: list[dict] = load_json(PROJEKTY_FILE, [])


def _img_url(rel: str | None) -> str | None:
    """Wartość z IMG_MAP -> URL. 'wystawa/plik.jpg' -> /img/...; '/uploads/...'
    (zdjęcie wgrane przez edycję) zostaje bez zmian; brak -> None."""
    if not rel:
        return None
    return rel if rel.startswith("/") else f"/img/{rel}"


def lokacje_payload() -> list[dict]:
    """Lokacje wzbogacone o URL miniatury per eksponat."""
    out = []
    for lok in LOKACJE:
        lok2 = {**lok}
        subs = []
        for sub in lok.get("pod_lokalizacje", []):
            eksp = []
            for nazwa in sub.get("eksponaty", []):
                eksp.append({"nazwa": nazwa, "img": _img_url(IMG_MAP.get(nazwa))})
            subs.append({**sub, "eksponaty": eksp})
        lok2["pod_lokalizacje"] = subs
        out.append(lok2)
    return out


# --------------------------------------------------------------------------- #
# WebSocket hub
# --------------------------------------------------------------------------- #
class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self.lock:
            self.clients.discard(ws)

    async def broadcast(self, message: dict, exclude: WebSocket | None = None) -> None:
        dead = []
        async with self.lock:
            targets = [c for c in self.clients if c is not exclude]
        for c in targets:
            try:
                await c.send_json(message)
            except Exception:
                dead.append(c)
        if dead:
            async with self.lock:
                for c in dead:
                    self.clients.discard(c)


hub = Hub()


async def emit(channel: str, action: str, payload: dict) -> None:
    await hub.broadcast({"channel": channel, "action": action, "payload": payload})


# --------------------------------------------------------------------------- #
# Banner startowy z adresami LAN
# --------------------------------------------------------------------------- #
def lan_ips() -> list[str]:
    """Wszystkie adresy IPv4 tego komputera w sieci (bez loopbacku)."""
    ips: set[str] = set()
    try:  # główny adres wyjściowy (nie wysyła pakietów)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass
    return sorted(ips)


def print_banner() -> None:
    port = os.environ.get("DTE_PORT", "8000")
    addrs = lan_ips()
    line = "═" * 52
    print(f"\n{line}")
    print("  DTE — CNE  uruchomiony")
    print(f"  Ten komputer:   http://localhost:{port}")
    if addrs:
        print("  W sieci LAN (wpisz na innym urządzeniu):")
        for ip in addrs:
            print(f"                  http://{ip}:{port}")
    else:
        print("  (nie wykryto adresu LAN — sprawdź połączenie sieciowe)")
    print("  Jeśli inne urządzenie nie łączy się: odblokuj port w firewallu.")
    print(f"{line}\n", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print_banner()
    yield


# --------------------------------------------------------------------------- #
# Aplikacja
# --------------------------------------------------------------------------- #
app = FastAPI(title="DTE — CNE", lifespan=lifespan)

app.mount("/img", StaticFiles(directory=str(IMG)), name="img")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS)), name="uploads")
if STATIC.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(str(STATIC / "index.html"))


# ---- Dane referencyjne ---------------------------------------------------- #
@app.get("/api/bootstrap")
async def bootstrap() -> dict:
    return {
        "lokacje": lokacje_payload(),
        "statusy": STATUSY,
        "today": date.today().isoformat(),
        "serverTime": datetime.now().isoformat(),
        # Liczba zarchiwizowanych kart w każdej kolekcji — badge na przycisku „Historia".
        "archCounts": {
            name: sum(1 for c in coll[0] if c.get("archiwum"))
            for name, coll in COLLECTIONS.items()
        },
    }


@app.get("/api/lokacje")
async def get_lokacje() -> list[dict]:
    return lokacje_payload()


@app.get("/api/statusy")
async def get_statusy() -> dict[str, list[str]]:
    return STATUSY


# ---- Raport per-dzień ------------------------------------------------------ #
def _raport_path(d: str) -> Path:
    y, m, dd = d.split("-")
    return ARCH / y / m / dd / "raport.json"


def _parse_date(d: str) -> date:
    try:
        return date.fromisoformat(d)
    except ValueError:
        raise HTTPException(400, "Zła data (oczekiwano YYYY-MM-DD)")


# Stary 3-stanowy model (ok/problem/off) → obecny 5-stanowy. Stare raporty
# archiwalne nadal trzymają 'problem'/'off'; tłumaczymy je przy odczycie,
# dobierając stan o tym samym kolorze (problem=żółty→inne, off=czerwony→usterka).
_LEGACY_STAN = {"problem": "inne", "off": "usterka"}


def _normalize_eksponaty(eksponaty: dict) -> dict:
    for rec in eksponaty.values():
        if isinstance(rec, dict) and rec.get("stan") in _LEGACY_STAN:
            rec["stan"] = _LEGACY_STAN[rec["stan"]]
    return eksponaty


def _previous_states() -> dict[str, dict]:
    """Najnowszy zapisany pełny rekord per eksponat (stan + opis/status/media) — zasiew nowego dnia."""
    if not ARCH.exists():
        return {}
    files = sorted(ARCH.glob("*/*/*/raport.json"))
    states: dict[str, dict] = {}
    for f in files:  # rosnąco po dacie -> późniejsze nadpisują
        data = load_json(f, {})
        for key, rec in _normalize_eksponaty(data.get("eksponaty") or {}).items():
            if rec.get("stan"):
                states[key] = dict(rec)
    return states


@app.get("/api/raport/{d}")
async def get_raport(d: str) -> dict:
    _parse_date(d)
    data = load_json(_raport_path(d), None)
    is_today = d == date.today().isoformat()
    if data is None:
        # nowy dzień: zasiej pełne rekordy (stan + opis/status/media) z poprzedniego zapisu
        data = {"date": d, "eksponaty": {}}
        if is_today:
            for key, rec in _previous_states().items():
                data["eksponaty"][key] = dict(rec)
    else:
        _normalize_eksponaty(data.get("eksponaty") or {})
    data["editable"] = is_today
    return data


def _date_from_path(f: Path) -> str | None:
    """YYYY-MM-DD z układu arch/RRRR/MM/DD/raport.json (fallback gdy brak pola)."""
    try:
        return f"{f.parents[2].name}-{f.parents[1].name}-{f.parents[0].name}"
    except IndexError:
        return None


@app.get("/api/raport-historia")
async def raport_historia(przed: str | None = None, limit: int = 60) -> dict:
    """Historia stanów do widoku osi czasu: dni z zapisanym raportem (malejąco),
    wcześniejsze niż `przed`. Każdy dzień: {date, stany: {klucz_eksponatu: stan}}."""
    rows: list[dict] = []
    for f in ARCH.glob("*/*/*/raport.json"):
        data = load_json(f, {})
        dd = data.get("date") or _date_from_path(f)
        if not dd or (przed and dd >= przed):
            continue
        eksp = _normalize_eksponaty(data.get("eksponaty") or {})
        stany = {k: r["stan"] for k, r in eksp.items() if isinstance(r, dict) and r.get("stan")}
        if stany:
            rows.append({"date": dd, "stany": stany})
    rows.sort(key=lambda r: r["date"], reverse=True)
    return {"dni": rows[:limit]}


@app.put("/api/raport/{d}")
async def put_raport(d: str, body: dict = Body(...)) -> dict:
    _parse_date(d)
    if d != date.today().isoformat():
        raise HTTPException(403, "Dni archiwalne są tylko do odczytu")
    body["date"] = d
    body["savedAt"] = datetime.now().isoformat()
    save_json(_raport_path(d), body)
    await emit("raport", "update", {"date": d, "data": body})
    return {"ok": True, "savedAt": body["savedAt"]}


# ---- Edycja eksponatów (zdjęcie + nazwa) ----------------------------------- #
# Zmiany lecą do data/*.json i są od razu rozsyłane przez WebSocket ("hot reload"
# bez restartu): klienci podmieniają store.lokacje na świeży payload.
@app.patch("/api/eksponat/foto")
async def set_eksponat_foto(body: dict = Body(...)) -> dict:
    """Ustaw/zmień/usuń zdjęcie eksponatu. body: {nazwa, img: '/uploads/...'|null}."""
    nazwa = body.get("nazwa")
    if not nazwa:
        raise HTTPException(400, "Brak nazwy eksponatu")
    IMG_MAP[nazwa] = body.get("img") or None
    save_json(IMG_MAP_FILE, IMG_MAP)
    await emit("lokacje", "update", {"lokacje": lokacje_payload()})
    return {"ok": True, "img": _img_url(IMG_MAP[nazwa])}


@app.patch("/api/eksponat/nazwa")
async def rename_eksponat(body: dict = Body(...)) -> dict:
    """Zmień nazwę eksponatu. body: {wystawaId, stara, nowa}. Migracja minimalna:
    lokacje.json + mapowanie zdjęcia + stan w DZISIEJSZYM raporcie. Archiwum bez zmian."""
    wyst = body.get("wystawaId")
    stara = body.get("stara")
    nowa = (body.get("nowa") or "").strip()
    if not (wyst and stara and nowa):
        raise HTTPException(400, "Wymagane: wystawaId, stara, nowa")
    if nowa == stara:
        return {"ok": True}

    # 1) lokacje.json — podmień nazwę w liście eksponatów danej pod-lokalizacji
    found = False
    for lok in LOKACJE:
        for sub in lok.get("pod_lokalizacje", []):
            if sub.get("id") != wyst:
                continue
            eks = sub.get("eksponaty", [])
            if nowa in eks:
                raise HTTPException(409, "Eksponat o tej nazwie już istnieje w tej wystawie")
            for i, n in enumerate(eks):
                if n == stara:
                    eks[i] = nowa
                    found = True
                    break
    if not found:
        raise HTTPException(404, "Nie znaleziono eksponatu")
    save_json(LOKACJE_FILE, LOKACJE)

    # 2) eksponaty_img.json — przenieś mapowanie zdjęcia pod nową nazwę
    if stara in IMG_MAP:
        IMG_MAP[nowa] = IMG_MAP.pop(stara)
        save_json(IMG_MAP_FILE, IMG_MAP)

    # 3) dzisiejszy raport — przenieś stan pod nowy klucz "wystawaId::nazwa"
    today = date.today().isoformat()
    rp = _raport_path(today)
    data = load_json(rp, None)
    if data:
        eksp = data.get("eksponaty") or {}
        ok, nk = f"{wyst}::{stara}", f"{wyst}::{nowa}"
        if ok in eksp:
            eksp[nk] = eksp.pop(ok)
            data["eksponaty"] = eksp
            save_json(rp, data)
            await emit("raport", "update", {"date": today, "data": data})

    await emit("lokacje", "update", {"lokacje": lokacje_payload()})
    return {"ok": True}


# ---- Otwieranie lokalnych ścieżek (element "link" w kartach modularnych) --- #
# Przeglądarka nie może nawigować do file://, więc dla lokalnych folderów/plików
# odpalamy natywnego eksploratora plików na maszynie, na której działa backend.
# UWAGA: musi być zarejestrowane PRZED generycznym /api/{name} niżej — inaczej
# "/api/open-path" zostałby dopasowany jako {name}="open-path" (create_card).
@app.post("/api/open-path")
async def open_path(body: dict = Body(...)) -> dict:
    path = (body.get("path") or "").strip()
    if not path:
        raise HTTPException(400, "Brak ścieżki")
    system = platform.system()
    try:
        if system == "Windows":
            os.startfile(path)  # type: ignore[attr-defined]
        elif system == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except OSError as e:
        raise HTTPException(500, f"Nie można otworzyć ścieżki: {e}")
    return {"ok": True}


# ---- Karty (Problemy / Zakupy / Eksploatacja / Przerwa techniczna / Projekty) --------- #
# "przerwa" i "projekty" mają inny kształt karty (status zamiast priorytet, updates
# zamiast opis/zdjecia/komentarze) — patrz create_card i update_card niżej.
COLLECTIONS = {
    "problemy": (PROBLEMY, PROBLEMY_FILE),
    "zakupy": (ZAKUPY, ZAKUPY_FILE),
    "eksploatacja": (EKSPLOATACJA, EKSPLOATACJA_FILE),
    "przerwa": (PRZERWA, PRZERWA_FILE),
    "projekty": (PROJEKTY, PROJEKTY_FILE),
}


def _coll(name: str) -> tuple[list[dict], Path]:
    if name not in COLLECTIONS:
        raise HTTPException(404, "Nieznana kolekcja")
    return COLLECTIONS[name]


def _persist(name: str) -> None:
    items, path = _coll(name)
    save_json(path, items)


@app.get("/api/{name}")
async def list_cards(name: str) -> list[dict]:
    items, _ = _coll(name)
    return [c for c in items if not c.get("archiwum")]


@app.get("/api/{name}/archiwum")
async def list_archived(name: str) -> list[dict]:
    """Zamknięte (zarchiwizowane) karty danej kolekcji — dla panelu Historii.
    Najnowsze zamknięcie na górze (sort malejąco po closedAt)."""
    items, _ = _coll(name)
    arch = [c for c in items if c.get("archiwum")]
    arch.sort(key=lambda c: c.get("closedAt") or "", reverse=True)
    return arch


@app.post("/api/{name}")
async def create_card(name: str, body: dict = Body(default={})) -> dict:
    items, _ = _coll(name)
    base = {
        "id": uuid.uuid4().hex[:12],
        "tytul": body.get("tytul", ""),
        "archiwum": False,
        "createdAt": datetime.now().isoformat(),
    }
    if name in ("przerwa", "projekty"):
        # Inny kształt karty: 2 statusy (aktywne/oczekujące) + modularne "updates"
        # zamiast priorytetu/opisu/zdjęć/czatu. "okladka" — opcjonalne zdjęcie w tle
        # nagłówka karty (patrz ModularCard.js). "zalaczniki" — dowolne pliki do
        # pobrania, niezależne od zdjęć/updates (patrz AttachmentUpload.js).
        card = {**base, "status": body.get("status", "oczekujace"), "updates": [], "okladka": None, "zalaczniki": []}
    else:
        card = {
            **base,
            "priorytet": body.get("priorytet", "oczekujace"),
            "lokalizacja": body.get("lokalizacja"),
            "opis": body.get("opis", ""),
            "zdjecia": [],
            "komentarze": [],
            "zalaczniki": [],
        }
    items.insert(0, card)
    _persist(name)
    await emit(name, "create", card)
    return card


@app.patch("/api/{name}/{card_id}")
async def update_card(name: str, card_id: str, body: dict = Body(...)) -> dict:
    items, _ = _coll(name)
    card = next((c for c in items if c["id"] == card_id), None)
    if card is None:
        raise HTTPException(404, "Nie ma takiej karty")
    for k in ("tytul", "priorytet", "lokalizacja", "opis", "zdjecia", "zdjeciaAlt", "status", "updates", "okladka", "zalaczniki"):
        if k in body:
            card[k] = body[k]
    _persist(name)
    await emit(name, "update", card)
    return card


@app.post("/api/{name}/{card_id}/komentarz")
async def add_comment(name: str, card_id: str, body: dict = Body(...)) -> dict:
    items, _ = _coll(name)
    card = next((c for c in items if c["id"] == card_id), None)
    if card is None:
        raise HTTPException(404, "Nie ma takiej karty")
    msg = {
        "id": uuid.uuid4().hex[:8],
        "autor": body.get("autor", "warsztat"),  # 'warsztat' | 'biuro'
        "tekst": body.get("tekst", ""),
        "ts": datetime.now().isoformat(),
    }
    card.setdefault("komentarze", []).append(msg)
    _persist(name)
    await emit(name, "comment", {"cardId": card_id, "komentarz": msg})
    return msg


@app.patch("/api/{name}/{card_id}/komentarz/{msg_id}")
async def edit_comment(name: str, card_id: str, msg_id: str, body: dict = Body(...)) -> dict:
    items, _ = _coll(name)
    card = next((c for c in items if c["id"] == card_id), None)
    if card is None:
        raise HTTPException(404, "Nie ma takiej karty")
    msg = next((m for m in card.get("komentarze", []) if m["id"] == msg_id), None)
    if msg is None:
        raise HTTPException(404, "Nie ma takiej wiadomości")
    msg["tekst"] = body.get("tekst", msg["tekst"])
    msg["editedAt"] = datetime.now().isoformat()
    _persist(name)
    await emit(name, "comment-edit", {"cardId": card_id, "komentarz": msg})
    return msg


@app.delete("/api/{name}/{card_id}/komentarz/{msg_id}")
async def delete_comment(name: str, card_id: str, msg_id: str) -> dict:
    """Usuwanie miękkie — treść znika, w wątku zostaje ślad "wiadomość usunięta"."""
    items, _ = _coll(name)
    card = next((c for c in items if c["id"] == card_id), None)
    if card is None:
        raise HTTPException(404, "Nie ma takiej karty")
    msg = next((m for m in card.get("komentarze", []) if m["id"] == msg_id), None)
    if msg is None:
        raise HTTPException(404, "Nie ma takiej wiadomości")
    msg["tekst"] = ""
    msg["usunieta"] = True
    msg["editedAt"] = datetime.now().isoformat()
    _persist(name)
    await emit(name, "comment-edit", {"cardId": card_id, "komentarz": msg})
    return msg


@app.post("/api/{name}/reorder")
async def reorder_cards(name: str, body: dict = Body(...)) -> dict:
    items, _ = _coll(name)
    order = body.get("order", [])
    pos = {cid: i for i, cid in enumerate(order)}
    items.sort(key=lambda c: pos.get(c["id"], 10_000))
    _persist(name)
    await emit(name, "reorder", {"order": order})
    return {"ok": True}


@app.delete("/api/{name}/{card_id}")
async def archive_card(name: str, card_id: str) -> dict:
    items, _ = _coll(name)
    card = next((c for c in items if c["id"] == card_id), None)
    if card is None:
        raise HTTPException(404, "Nie ma takiej karty")
    card["archiwum"] = True
    card["closedAt"] = datetime.now().isoformat()
    _persist(name)
    await emit(name, "archive", {"cardId": card_id, "closedAt": card["closedAt"]})
    return {"ok": True}


@app.post("/api/{name}/{card_id}/przywroc")
async def restore_card(name: str, card_id: str) -> dict:
    """Przywrócenie zarchiwizowanej karty z powrotem do aktywnych — zdejmuje flagę
    archiwum, kasuje datę zamknięcia i przenosi kartę na początek listy aktywnych."""
    items, _ = _coll(name)
    card = next((c for c in items if c["id"] == card_id), None)
    if card is None:
        raise HTTPException(404, "Nie ma takiej karty")
    card["archiwum"] = False
    card.pop("closedAt", None)
    items.remove(card)
    items.insert(0, card)
    _persist(name)
    await emit(name, "restore", card)
    return card


@app.delete("/api/{name}/{card_id}/trwale")
async def delete_card_permanently(name: str, card_id: str) -> dict:
    """Twarde usunięcie — karta znika całkowicie (również jeśli już w archiwum),
    razem z katalogiem przesłanych zdjęć/mediów."""
    items, _ = _coll(name)
    idx = next((i for i, c in enumerate(items) if c["id"] == card_id), None)
    if idx is None:
        raise HTTPException(404, "Nie ma takiej karty")
    was_archived = bool(items[idx].get("archiwum"))
    items.pop(idx)
    _persist(name)
    card_dir = UPLOADS / name / card_id
    if card_dir.exists():
        shutil.rmtree(card_dir, ignore_errors=True)
    # 'archiwum' w evencie: klienci wiedzą, czy zmniejszyć licznik archiwum (badge Historii).
    await emit(name, "delete", {"cardId": card_id, "archiwum": was_archived})
    return {"ok": True}


@app.post("/api/{name}/{card_id}/przenies")
async def move_card(name: str, card_id: str, body: dict = Body(...)) -> dict:
    """Przeniesienie karty do innej kolekcji (np. Problemy → Eksploatacja) — razem
    z komentarzami i mediami (katalog uploadów przenoszony, URL-e zdjęć przemapowane)."""
    target = body.get("do", "")
    if target == name or target not in COLLECTIONS:
        raise HTTPException(400, "Zła kolekcja docelowa")
    items, _ = _coll(name)
    idx = next((i for i, c in enumerate(items) if c["id"] == card_id), None)
    if idx is None:
        raise HTTPException(404, "Nie ma takiej karty")
    card = items.pop(idx)
    _persist(name)

    old_dir = UPLOADS / name / card_id
    if old_dir.exists():
        new_dir = UPLOADS / target / card_id
        new_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_dir), str(new_dir))
        prefix_old, prefix_new = f"/uploads/{name}/{card_id}/", f"/uploads/{target}/{card_id}/"
        card["zdjecia"] = [u.replace(prefix_old, prefix_new) for u in card.get("zdjecia", [])]
        if card.get("zalaczniki"):
            for a in card["zalaczniki"]:
                a["url"] = a["url"].replace(prefix_old, prefix_new)

    target_items, _ = _coll(target)
    target_items.insert(0, card)
    _persist(target)

    await emit(name, "delete", {"cardId": card_id})
    await emit(target, "create", card)
    return {"ok": True, "card": card}


# ---- Upload mediów --------------------------------------------------------- #
@app.post("/api/upload/{kontekst}/{owner_id}")
async def upload(kontekst: str, owner_id: str, request: Request) -> JSONResponse:
    form = await request.form()
    dest = UPLOADS / kontekst / owner_id
    dest.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    for value in form.values():
        if isinstance(value, UploadFile):
            safe = re.sub(r"[^A-Za-z0-9._-]+", "_", value.filename or "plik")
            fname = f"{uuid.uuid4().hex[:8]}_{safe}"
            async with aiofiles.open(dest / fname, "wb") as out:
                await out.write(await value.read())
            urls.append(f"/uploads/{kontekst}/{owner_id}/{fname}")
    return JSONResponse({"urls": urls})


# ---- Admin: import/restore archiwum ---------------------------------------- #
# Repo publiczne nie zawiera danych produkcyjnych (patrz .gitignore: data/,
# uploads/, arch/) — na świeżej instalacji te katalogi są puste. Ten endpoint
# pozwala je odtworzyć z zip-a spakowanego ręcznie z katalogu produkcyjnego
# (np. `zip -r archiwum.zip data uploads arch`).
ALLOWED_TOP_DIRS = ("data", "uploads", "arch")


def _safe_zip_member(name: str) -> tuple[str, Path] | None:
    """Waliduje wpis archiwum: musi leżeć w data/uploads/arch i nie może wyjść
    poza katalog aplikacji (ochrona przed zip-slip). Zwraca (katalog_top,
    docelowa_sciezka) albo None, gdy wpis jest niedozwolony."""
    norm = name.replace("\\", "/").strip("/")
    if not norm:
        return None
    parts = Path(norm).parts
    if ".." in parts or parts[0] not in ALLOWED_TOP_DIRS:
        return None
    target = (BASE / norm).resolve()
    if BASE.resolve() not in target.parents:
        return None
    return parts[0], target


def _reload_data_collections() -> None:
    """Po podmianie plików w data/ na dysku odświeża stan w pamięci procesu —
    bez tego backend serwowałby stare dane aż do restartu (patrz load_json
    przy starcie modułu)."""
    LOKACJE[:] = load_json(LOKACJE_FILE, [])
    STATUSY.clear()
    STATUSY.update(load_json(STATUSY_FILE, {}))
    PROBLEMY[:] = load_json(PROBLEMY_FILE, [])
    ZAKUPY[:] = load_json(ZAKUPY_FILE, [])
    EKSPLOATACJA[:] = load_json(EKSPLOATACJA_FILE, [])
    PRZERWA[:] = load_json(PRZERWA_FILE, [])
    PROJEKTY[:] = load_json(PROJEKTY_FILE, [])
    IMG_MAP.clear()
    IMG_MAP.update(build_image_map(LOKACJE))


@app.post("/api/admin/import-archiwum")
async def import_archiwum(request: Request) -> JSONResponse:
    """Wgrywa zip z kopią zapasową i podmienia nią data/uploads/arch. Katalogi
    top-level obecne w archiwum są NAJPIERW przenoszone do _backup/<znacznik
    czasu>/ (nie kasowane) — na wypadek wgrania złego pliku."""
    form = await request.form()
    plik = next((v for v in form.values() if isinstance(v, UploadFile)), None)
    if plik is None:
        raise HTTPException(400, "Brak pliku archiwum")

    raw = await plik.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(400, "Plik nie jest poprawnym archiwum zip")

    entries: list[tuple[str, Path, zipfile.ZipInfo]] = []
    top_dirs: set[str] = set()
    for info in zf.infolist():
        if info.is_dir():
            continue
        valid = _safe_zip_member(info.filename)
        if valid is None:
            raise HTTPException(
                400,
                f"Niedozwolona ścieżka w archiwum: „{info.filename}” — dozwolone "
                f"tylko wewnątrz {', '.join(f'{d}/' for d in ALLOWED_TOP_DIRS)}",
            )
        top_dir, target = valid
        top_dirs.add(top_dir)
        entries.append((top_dir, target, info))

    if not entries:
        raise HTTPException(400, "Archiwum nie zawiera żadnych plików w data/, uploads/ ani arch/")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = BASE / "_backup" / stamp
    for top_dir in top_dirs:
        src = BASE / top_dir
        if src.exists():
            backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(backup_dir / top_dir))
        src.mkdir(parents=True, exist_ok=True)

    for _, target, info in entries:
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src_f, target.open("wb") as out_f:
            shutil.copyfileobj(src_f, out_f)

    if "data" in top_dirs:
        _reload_data_collections()

    await emit("system", "restore", {"topDirs": sorted(top_dirs)})
    return JSONResponse({
        "ok": True,
        "zaimportowano": sorted(top_dirs),
        "plikow": len(entries),
        "backup": str(backup_dir.relative_to(BASE)) if backup_dir.exists() else None,
    })


# ---- WebSocket ------------------------------------------------------------- #
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await hub.connect(ws)
    try:
        await ws.send_json({"channel": "system", "action": "hello", "payload": {"clients": len(hub.clients)}})
        while True:
            await ws.receive_text()  # keepalive; klient nie musi nic wysyłać
    except WebSocketDisconnect:
        await hub.disconnect(ws)
    except Exception:
        await hub.disconnect(ws)
