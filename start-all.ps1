param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ROOT = $PSScriptRoot

function Stop-ExistingProcesses {
    Write-Host "[PramaIA Licensing Server] Stopping existing processes..." -ForegroundColor Yellow
    
    # Kill processes on port 8030 (backend)
    $backend = Get-NetTCPConnection -LocalPort 8030 -ErrorAction SilentlyContinue
    if ($backend) {
        $backend | ForEach-Object { 
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
        }
        Write-Host "  Stopped backend process on port 8030" -ForegroundColor Gray
    }
    
    # Kill processes on port 3030 (frontend)
    $frontend = Get-NetTCPConnection -LocalPort 3030 -ErrorAction SilentlyContinue
    if ($frontend) {
        $frontend | ForEach-Object { 
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
        }
        Write-Host "  Stopped frontend process on port 3030" -ForegroundColor Gray
    }
    
    Start-Sleep -Milliseconds 500
}

function Start-Backend {
    Write-Host "[PramaIA Licensing Server] Starting backend on port 8030..." -ForegroundColor Cyan
    if (-not (Test-Path "$ROOT\.venv")) {
        Write-Host "Creating virtual environment..." -ForegroundColor Yellow
        python -m venv "$ROOT\.venv"
    }
    Start-Process powershell -ArgumentList "-NoExit", "-Command", `
        "cd '$ROOT'; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt --quiet; python -m uvicorn backend.main:app --reload --port 8030" `
        -WindowStyle Normal
}

function Start-Frontend {
    Write-Host "[PramaIA Licensing Server] Starting frontend on port 3030..." -ForegroundColor Cyan
    $fe = Join-Path $ROOT "frontend"
    if (-not (Test-Path "$fe\node_modules")) {
        Write-Host "Installing npm packages..." -ForegroundColor Yellow
        npm install --prefix $fe
    }
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$fe'; npm start" -WindowStyle Normal
}

# Kill existing processes first
Stop-ExistingProcesses

if (-not $FrontendOnly) { Start-Backend }
Start-Sleep -Seconds 3
if (-not $BackendOnly) { Start-Frontend }

Write-Host ""
Write-Host "PramaIA Licensing Server is starting:" -ForegroundColor Green
Write-Host "  Backend  → http://localhost:8030" -ForegroundColor Green
Write-Host "  Frontend → http://localhost:3030" -ForegroundColor Green
Write-Host "  API Docs → http://localhost:8030/docs" -ForegroundColor Green
