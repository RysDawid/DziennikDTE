#!/usr/bin/env python3
"""
Optymalizacja zdjęć DTE — zmniejsza długi bok do MAX_PX i rekompresuje (JPEG/PNG).
Bezpieczne: DOMYŚLNIE tryb podglądu (nic nie zapisuje); zapis dopiero z --apply.
Nigdy nie powiększa i nigdy nie nadpisze pliku większym — tylko realne oszczędności.

    python optimize_images.py                 # podgląd: co i ile zaoszczędzi
    python optimize_images.py --apply         # wykonaj (nadpisuje w miejscu: img/ + uploads/)
    python optimize_images.py --apply img/wystawa   # tylko wskazane katalogi

Wymaga Pillow (jest w requirements.txt → po jednym ./run.sh / run.bat jest w .venv).
Uwaga: nadpisuje oryginały w miejscu. Pliki w Dropbox mają historię wersji.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("✗ Brak Pillow. Zainstaluj: pip install pillow  (albo uruchom raz ./run.sh / run.bat)")

MAX_PX = 2000          # maksymalny długi bok
JPEG_Q = 82            # jakość JPEG
EXTS = {".jpg", ".jpeg", ".png"}
BASE = Path(__file__).resolve().parent
DEFAULT_DIRS = ["img", "uploads"]


def human(n: float) -> str:
    for unit in ("B", "KB", "MB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def optimize(path: Path, apply: bool) -> tuple[str, int, int]:
    """Zwraca (status, bytes_przed, bytes_po). status: 'done' | 'skip' | 'err'."""
    before = path.stat().st_size
    try:
        im = Image.open(path)
        im = ImageOps.exif_transpose(im)  # uwzględnij orientację z EXIF
    except Exception:
        return ("err", before, before)

    w, h = im.size
    longest = max(w, h)
    resized = longest > MAX_PX
    if resized:
        s = MAX_PX / longest
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)

    is_jpeg = path.suffix.lower() in (".jpg", ".jpeg")
    buf = io.BytesIO()
    if is_jpeg:
        im.convert("RGB").save(buf, "JPEG", quality=JPEG_Q, optimize=True, progressive=True)
    else:
        im.save(buf, "PNG", optimize=True)
    after = buf.tell()

    # Zapisz, gdy: przycięto wymiar (twardy limit 2000px) LUB rekompresja daje istotny
    # zysk (≥3%). Próg chroni przed stratą generacyjną przy wielokrotnym uruchomieniu.
    if resized or after < before * 0.97:
        if apply:
            path.write_bytes(buf.getvalue())
        return ("done", before, after)
    return ("skip", before, before)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--apply"]
    apply = "--apply" in sys.argv
    dirs = [Path(a) for a in args] or [BASE / d for d in DEFAULT_DIRS]

    files: list[Path] = []
    for d in dirs:
        if d.exists():
            files += [f for f in d.rglob("*") if f.suffix.lower() in EXTS]
    files.sort()

    print(f"{'TRYB: ZAPIS (--apply)' if apply else 'TRYB: PODGLĄD (dodaj --apply aby zapisać)'}")
    print(f"Plików do sprawdzenia: {len(files)}  |  MAX {MAX_PX}px, JPEG q{JPEG_Q}\n")

    tot_before = tot_after = changed = errors = 0
    for f in files:
        status, before, after = optimize(f, apply)
        tot_before += before
        if status == "done":
            changed += 1
            tot_after += after
            print(f"  {'✓' if apply else '•'} {human(before):>9} → {human(after):>9}  "
                  f"({(1 - after / before) * 100:+4.0f}%)  {f.relative_to(BASE)}")
        else:
            tot_after += before
            if status == "err":
                errors += 1
                print(f"  ✗ błąd odczytu: {f.relative_to(BASE)}")

    saved = tot_before - tot_after
    print(f"\nDo zmiany: {changed} plików   Razem: {human(tot_before)} → {human(tot_after)}   "
          f"Oszczędność: {human(saved)} ({(saved / tot_before * 100) if tot_before else 0:.0f}%)")
    if errors:
        print(f"Błędów: {errors}")
    if not apply and changed:
        print("\n→ Aby zapisać zmiany uruchom ponownie z:  --apply")


if __name__ == "__main__":
    main()
