@echo off
setlocal enabledelayedexpansion

rem ---------------------------------------------------------------------------
rem DTE - CNE | Uruchamianie aplikacji (Windows)
rem Tworzy venv, instaluje zaleznosci i startuje serwer FastAPI.
rem
rem   run.bat            - port 8000, dostepny w calej sieci LAN
rem   run.bat 8080       - wlasny port
rem   run.bat 8080 127.0.0.1  - wlasny port, dostep tylko z tego komputera
rem
rem Uwaga: uzywa .venv-win zamiast .venv, bo .venv z Linuksa nie jest
rem        kompatybilny z Windows (inna struktura katalogow, brak Scripts\).
rem Uwaga: jesli na komputerze NIE MA zainstalowanego Pythona, skrypt sam
rem        pobiera przenosny "embeddable" Python z python.org do folderu
rem        .python-embed obok aplikacji (patrz sekcja "Brak Pythona" nizej) -
rem        nie trzeba nic instalowac recznie ani miec uprawnien administratora.
rem        Wymaga to jednorazowo internetu; po pobraniu wszystko zostaje
rem        lokalnie i kolejne uruchomienia juz nic nie sciagaja.
rem Uwaga: ten plik MUSI miec konce linii CRLF - przy LF cmd.exe sypie sie
rem        na blokach for/( ). Nie zapisuj go edytorem w trybie Unix (LF).
rem ---------------------------------------------------------------------------

cd /d "%~dp0"

set "HOST=0.0.0.0"
set "PORT=8000"
if not "%~1"=="" set "PORT=%~1"
if not "%~2"=="" set "HOST=%~2"
set "VENV=.venv-win"

rem Wersja/URL przenosnego Pythona uzywanego, gdy na komputerze nie ma
rem zadnego dzialajacego Pythona (patrz sekcja "Brak Pythona" nizej).
rem 64-bit (amd64) - wspolczesne Windowsy sa praktycznie zawsze 64-bitowe.
set "EMBED_VER=3.12.8"
set "EMBED_DIR=%~dp0.python-embed"
set "EMBED_EXE=!EMBED_DIR!\python.exe"
set "USE_EMBED=0"

rem --- Znajdz interpreter Pythona ---
rem Kolejnosc: py (Python Launcher) -> python -> python3. Launcher "py" jest
rem najpewniejszy; "python3.exe" na Windows to czesto zaslepka Microsoft Store,
rem ktora otwiera sklep zamiast uruchomic Pythona - dlatego sprawdzamy ja na koncu.
set "PY="
where py >nul 2>&1
if not errorlevel 1 set "PY=py"
if "!PY!"=="" (
    where python >nul 2>&1
    if not errorlevel 1 set "PY=python"
)
if "!PY!"=="" (
    where python3 >nul 2>&1
    if not errorlevel 1 set "PY=python3"
)

rem Sam fakt, ze "where" znalazl plik o tej nazwie, nie znaczy, ze dziala -
rem sprawdzamy realnie przez --version. Zaslepka Microsoft Store po
rem uruchomieniu zwykle nic sensownego nie wypisuje ^(tylko otwiera sklep^).
if not "!PY!"=="" (
    set "PYCHECK="
    for /f "delims=" %%v in ('"!PY!" --version 2^>^&1') do set "PYCHECK=%%v"
    echo !PYCHECK! | findstr /b /c:"Python 3" >nul
    if errorlevel 1 (
        echo [i] Znaleziono "!PY!" na PATH, ale nie dziala poprawnie ^(zaslepka Microsoft Store?^) - pomijam.
        set "PY="
    )
)

rem --- Brak Pythona: pobierz przenosny "embeddable" Python z python.org ---
rem Ten komputer moze nie miec i nigdy nie miec zainstalowanego Pythona - np.
rem stanowisko warsztatowe - zamiast konczyc dzialanie bledem, sciagamy
rem oficjalny, przenosny pakiet embeddable, bez instalatora i uprawnien
rem administratora, do folderu .python-embed obok aplikacji i uzywamy go
rem zamiast Pythona systemowego.
if "!PY!"=="" (
    if exist "!EMBED_EXE!" (
        echo [i] Uzywam wczesniej pobranego przenosnego Pythona ^(.python-embed^).
        set "USE_EMBED=1"
    ) else (
        echo.
        echo [i] Nie znaleziono dzialajacego Pythona na tym komputerze.
        echo [^>] Pobieram przenosny Python !EMBED_VER! z python.org - jednorazowo, potrzebny internet...

        set "EMBED_URL=https://www.python.org/ftp/python/!EMBED_VER!/python-!EMBED_VER!-embed-amd64.zip"
        set "EMBED_ZIP=%TEMP%\dte-python-embed.zip"
        set "DTE_URL=!EMBED_URL!"
        set "DTE_ZIP=!EMBED_ZIP!"
        powershell -NoProfile -Command "try { Invoke-WebRequest -Uri $env:DTE_URL -OutFile $env:DTE_ZIP -UseBasicParsing -UserAgent 'Mozilla/5.0' } catch { exit 1 }"
        if errorlevel 1 (
            echo.
            echo  BLAD: Nie udalo sie pobrac Pythona ^(brak internetu?^).
            echo  Zainstaluj go recznie ze strony https://www.python.org/downloads/
            echo  ^(zaznacz "Add Python to PATH" podczas instalacji^) i uruchom run.bat ponownie.
            echo.
            pause
            exit /b 1
        )

        echo [^>] Rozpakowuje...
        set "DTE_DIR=!EMBED_DIR!"
        powershell -NoProfile -Command "Expand-Archive -LiteralPath $env:DTE_ZIP -DestinationPath $env:DTE_DIR -Force"
        del /q "!EMBED_ZIP!" >nul 2>&1

        if not exist "!EMBED_EXE!" (
            echo.
            echo  BLAD: Rozpakowanie Pythona nie powiodlo sie ^(brak python.exe w .python-embed^).
            echo  Usun folder .python-embed i uruchom run.bat ponownie.
            echo.
            pause
            exit /b 1
        )

        rem Embeddable Python domyslnie ma WYLACZONY "import site" - plik
        rem pythonXY._pth - bez tego katalog Lib\site-packages jest
        rem ignorowany i zainstalowane biblioteki - fastapi, uvicorn itd. - nie
        rem beda widoczne. Odkomentowujemy linie "#import site".
        for %%f in ("!EMBED_DIR!\python*._pth") do (
            set "DTE_PTH=%%f"
            powershell -NoProfile -Command "(Get-Content -LiteralPath $env:DTE_PTH) -replace '^#import site$','import site' | Set-Content -LiteralPath $env:DTE_PTH"
        )

        echo [^>] Instaluje pip...
        set "DTE_GETPIP=%TEMP%\dte-get-pip.py"
        powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $env:DTE_GETPIP -UseBasicParsing -UserAgent 'Mozilla/5.0'"
        "!EMBED_EXE!" "!DTE_GETPIP!" --no-warn-script-location
        if errorlevel 1 (
            echo.
            echo  BLAD: Instalacja pip nie powiodla sie.
            echo.
            pause
            exit /b 1
        )
        del /q "!DTE_GETPIP!" >nul 2>&1

        echo [i] Przenosny Python gotowy w .python-embed\
        set "USE_EMBED=1"
    )
)

if "!USE_EMBED!"=="1" (
    rem .python-embed jest juz samodzielnym, prywatnym folderem obok
    rem aplikacji - dziala jak wlasny venv, wiec pomijamy tworzenie
    rem .venv-win i instalujemy zaleznosci bezposrednio w nim.
    set "RUN_PY=!EMBED_EXE!"
    set "STAMP=!EMBED_DIR!\.requirements.sha"
) else (
    for /f "tokens=2" %%v in ('"!PY!" --version 2^>^&1') do set "PYVER=%%v"
    echo [i] Python: !PY! !PYVER!

    rem --- Srodowisko wirtualne ---
    if not exist "!VENV!\Scripts\activate.bat" (
        echo [^>] Tworze srodowisko wirtualne - !VENV!...
        "!PY!" -m venv "!VENV!"
        if errorlevel 1 (
            echo  BLAD: Nie udalo sie utworzyc srodowiska wirtualnego.
            pause
            exit /b 1
        )
    )
    call "!VENV!\Scripts\activate.bat"
    set "RUN_PY=python"
    set "STAMP=!VENV!\.requirements.sha"
)

rem --- Zaleznosci - instaluj tylko gdy zmieniony requirements.txt ---
set "REQ_HASH="
for /f "usebackq" %%h in (`powershell -NoProfile -Command "(Get-FileHash requirements.txt -Algorithm SHA1).Hash"`) do set "REQ_HASH=%%h"

set "SAVED_HASH="
if exist "!STAMP!" set /p SAVED_HASH=<"!STAMP!"

if /i not "!REQ_HASH!"=="!SAVED_HASH!" (
    echo [^>] Instaluje zaleznosci...
    "!RUN_PY!" -m pip install -q --upgrade pip
    "!RUN_PY!" -m pip install -q -r requirements.txt
    if errorlevel 1 (
        echo  BLAD: Instalacja zaleznosci nie powiodla sie.
        pause
        exit /b 1
    )
    echo !REQ_HASH!>"!STAMP!"
)

rem --- Baner startowy ---
echo.
echo ====================================================
echo   DTE - CNE  uruchamianie...
echo   Ten komputer:   http://localhost:!PORT!
if "!HOST!"=="0.0.0.0" (
    for /f "usebackq" %%i in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress"`) do (
        echo   Siec LAN:       http://%%i:!PORT!
    )
    echo   Jesli inne urzadzenie nie laczy sie: odblokuj port !PORT! w
    echo   Zaporze sieciowej Windows ^(Panel sterowania ^> Zapora ^> Reguly^).
) else (
    echo   HOST=!HOST! - dostep tylko z tego komputera
)
echo   Ctrl+C aby zatrzymac.
echo ====================================================
echo.

set "DTE_PORT=!PORT!"
"!RUN_PY!" -m uvicorn main:app --reload --host !HOST! --port !PORT!

echo.
echo Serwer zakonczyl dzialanie.
pause
