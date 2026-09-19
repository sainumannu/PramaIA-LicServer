@echo off
REM Avvio manuale (solo se NON installato come servizio Windows: due avvii = porta occupata, WinError 10048)
cd /d "%~dp0"

echo.
echo ======================================================================
echo  PramaIA Licensing Server
echo ======================================================================
echo.

if not exist ".env" (
    echo ERRORE: .env non trovato in %cd%
    echo Rieseguire l'installer oppure creare .env da .env.template
    pause
    exit /b 1
)

sc query PramaIA-LicServer 2>nul | find "RUNNING" >nul
if not errorlevel 1 (
    echo Il servizio Windows PramaIA-LicServer e' gia' in esecuzione: non serve avviarlo a mano.
    pause
    exit /b 0
)

PramaIA-LicServer.exe

echo.
echo Servizio terminato.
pause
