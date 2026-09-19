# ============================================================================
# PramaIA Licensing Server - Build Release Package
# ============================================================================
# Crea un pacchetto di distribuzione on-premise con:
#   - Backend compilato (PyInstaller, nessun sorgente Python leggibile)
#   - Frontend React compilato (servito dal backend sulla stessa porta)
#   - Script di avvio e gestione servizio Windows (NSSM)
#   - Installer Inno Setup
#
# Uso (dalla radice del repo):
#   .\installer\build-release.ps1 -Version "1.0.0"
# ============================================================================

param(
    [string]$Version = "1.0.0",
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipInstaller,
    [string]$InnoSetupPath = ""
)

$ErrorActionPreference = "Stop"
$INSTALLER = $PSScriptRoot
$ROOT = Split-Path $PSScriptRoot -Parent
$releaseDir = Join-Path $INSTALLER "release"
$AppExe = "PramaIA-LicServer"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PramaIA Licensing Server - Build Release v$Version" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------------------------
# 0. Prerequisiti
# --------------------------------------------------------------------------
Write-Host "[0/5] Verifica prerequisiti..." -ForegroundColor Yellow

$venvPython = Join-Path $ROOT ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "  ERRORE: .venv non trovato. Crea il venv e installa requirements.txt prima." -ForegroundColor Red
    exit 1
}
Write-Host "  Python: $(& $venvPython --version)" -ForegroundColor Green

if (-not $SkipBackend) {
    & $venvPython -m pip show pyinstaller *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Installo PyInstaller nel venv..." -ForegroundColor Yellow
        & $venvPython -m pip install pyinstaller --quiet
        if ($LASTEXITCODE -ne 0) { Write-Host "  ERRORE: installazione PyInstaller fallita" -ForegroundColor Red; exit 1 }
    }
    Write-Host "  PyInstaller: OK" -ForegroundColor Green
}

if (-not $SkipFrontend) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "  ERRORE: npm non trovato nel PATH (serve per compilare il frontend)" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Node: $(node --version)" -ForegroundColor Green
}

if (-not (Test-Path (Join-Path $INSTALLER "nssm.exe"))) {
    Write-Host "  ERRORE: installer\nssm.exe non trovato. Scaricalo da https://nssm.cc/download (64-bit)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# --------------------------------------------------------------------------
# 1. Pulizia
# --------------------------------------------------------------------------
Write-Host "[1/5] Preparazione directory di output..." -ForegroundColor Yellow

# Con -SkipBackend / -SkipFrontend si riusano gli artefatti gia' presenti in release\
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
if (-not $SkipBackend)  { Remove-Item -Force (Join-Path $releaseDir "$AppExe.exe") -ErrorAction SilentlyContinue }
if (-not $SkipFrontend) { Remove-Item -Recurse -Force (Join-Path $releaseDir "frontend") -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path (Join-Path $releaseDir "logs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releaseDir "data") | Out-Null
Write-Host "  Directory $releaseDir pronta" -ForegroundColor Green
Write-Host ""

# --------------------------------------------------------------------------
# 2. Build Frontend (React)
# --------------------------------------------------------------------------
if (-not $SkipFrontend) {
    Write-Host "[2/5] Build frontend React..." -ForegroundColor Yellow
    $fe = Join-Path $ROOT "frontend"
    Push-Location $fe
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "  npm install..." -ForegroundColor Gray
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install fallito" }
        }
        # Stessa origine del backend: le chiamate API sono relative (BASE_URL vuoto).
        $env:REACT_APP_BACKEND_URL = $null
        $env:CI = "false"                 # in CI=true i warning ESLint farebbero fallire la build
        $env:GENERATE_SOURCEMAP = "false"
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build fallito" }
    } catch {
        Write-Host "  ERRORE: $_" -ForegroundColor Red
        exit 1
    } finally {
        Pop-Location
    }
    Copy-Item (Join-Path $fe "build") (Join-Path $releaseDir "frontend") -Recurse -Force
    Write-Host "  Frontend compilato" -ForegroundColor Green
} else {
    Write-Host "[2/5] Frontend skippato (flag -SkipFrontend)" -ForegroundColor Gray
}
Write-Host ""

# --------------------------------------------------------------------------
# 3. Build Backend con PyInstaller
# --------------------------------------------------------------------------
if (-not $SkipBackend) {
    Write-Host "[3/5] Build backend con PyInstaller..." -ForegroundColor Yellow
    Push-Location $ROOT
    $buildDir = Join-Path $INSTALLER "build"
    try {
        & $venvPython -m PyInstaller `
            --name $AppExe `
            --onefile `
            --console `
            --noconfirm `
            --paths $ROOT `
            --collect-submodules backend `
            --collect-submodules uvicorn `
            --collect-submodules sqlalchemy.dialects.sqlite `
            --hidden-import aiosqlite `
            --hidden-import greenlet `
            --hidden-import multipart `
            --distpath $releaseDir `
            --workpath $buildDir `
            --specpath $buildDir `
            service_entry.py
        if ($LASTEXITCODE -ne 0) { throw "PyInstaller fallito" }
    } catch {
        Write-Host "  ERRORE: $_" -ForegroundColor Red
        exit 1
    } finally {
        Pop-Location
    }

    if (-not (Test-Path (Join-Path $releaseDir "$AppExe.exe"))) {
        Write-Host "  ERRORE: eseguibile non trovato dopo la build" -ForegroundColor Red
        exit 1
    }
    Remove-Item -Recurse -Force $buildDir -ErrorAction SilentlyContinue
    Write-Host "  Backend compilato: $releaseDir\$AppExe.exe" -ForegroundColor Green
} else {
    Write-Host "[3/5] Backend skippato (flag -SkipBackend)" -ForegroundColor Gray
}
Write-Host ""

# --------------------------------------------------------------------------
# 4. File di supporto (NB: .env e keys/ NON vengono mai inclusi: l'installer
#    genera .env dalle risposte del wizard e le chiavi RSA al primo avvio)
# --------------------------------------------------------------------------
Write-Host "[4/5] Copia file di supporto..." -ForegroundColor Yellow
Copy-Item (Join-Path $INSTALLER "nssm.exe") $releaseDir -Force
Copy-Item (Join-Path $INSTALLER "start-service.cmd") $releaseDir -Force
Copy-Item (Join-Path $INSTALLER "INSTALLER_README.md") $releaseDir -Force
Copy-Item (Join-Path $ROOT "README.md") $releaseDir -Force
"" | Out-File (Join-Path $releaseDir "logs\.gitkeep")
"" | Out-File (Join-Path $releaseDir "data\.gitkeep")
Write-Host "  File copiati" -ForegroundColor Green
Write-Host ""

# --------------------------------------------------------------------------
# 5. Installer con Inno Setup
# --------------------------------------------------------------------------
if (-not $SkipInstaller) {
    Write-Host "[5/5] Creazione installer con Inno Setup..." -ForegroundColor Yellow

    if (-not $InnoSetupPath) {
        $InnoSetupPath = @(
            "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
            "C:\Program Files\Inno Setup 6\ISCC.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    if (-not $InnoSetupPath -or -not (Test-Path $InnoSetupPath)) {
        Write-Host "  ERRORE: Inno Setup non trovato. Scaricalo da https://jrsoftware.org/isdl.php" -ForegroundColor Red
        exit 1
    }

    Push-Location $INSTALLER
    try {
        & $InnoSetupPath "/DMyAppVersion=$Version" "installer.iss"
        if ($LASTEXITCODE -ne 0) { throw "Inno Setup fallito" }
    } catch {
        Write-Host "  ERRORE: $_" -ForegroundColor Red
        exit 1
    } finally {
        Pop-Location
    }

    $installerFile = Join-Path $INSTALLER "output\PramaIA-LicServer-Setup-$Version.exe"
    if (-not (Test-Path $installerFile)) {
        Write-Host "  ERRORE: installer non trovato dopo la build" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Installer creato: $installerFile" -ForegroundColor Green
} else {
    Write-Host "[5/5] Installer skippato (flag -SkipInstaller)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Build Release completato" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Release directory: $releaseDir" -ForegroundColor Cyan
Write-Host "  Installer: installer\output\PramaIA-LicServer-Setup-$Version.exe" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Prossimi step:" -ForegroundColor Yellow
Write-Host "  1. Installa su una macchina di test (come Administrator)" -ForegroundColor Gray
Write-Host "  2. Verifica: Invoke-RestMethod http://127.0.0.1:8030/api/health" -ForegroundColor Gray
Write-Host "  3. Leggi installer\INSTALLER_README.md prima di distribuire" -ForegroundColor Gray
Write-Host ""
