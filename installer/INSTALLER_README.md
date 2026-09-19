# PramaIA Licensing Server — Guida Installer Windows

**Leggere prima di installare o aggiornare.**
File installer: `installer\output\PramaIA-LicServer-Setup-<versione>.exe`
Directory default: `C:\Program Files\PramaIA\LicServer`
Porta di default: **8030** (backend + frontend sulla stessa porta) · Servizio: **PramaIA-LicServer**

---

## 1. Cosa installa

| Elemento | Note |
|----------|------|
| `PramaIA-LicServer.exe` | Backend FastAPI compilato (PyInstaller, onefile) |
| `frontend\` | Build React, servita dal backend: `http://localhost:8030/` |
| `nssm.exe` | Wrapper per il servizio Windows |
| `.env` | **Generato dal wizard alla prima installazione**, mai sovrascritto negli aggiornamenti |
| `data\` | Database SQLite e chiavi RSA di firma (`data\keys`) — **non rimosso dalla disinstallazione** |
| `logs\` | `licserver.log` (applicazione), `service.log` / `service-error.log` (NSSM) |

### Modalità di funzionamento (scelta nel wizard)

| Modalità | `STANDALONE_MODE` | `SERVICE_HOST` | Note |
|----------|-------------------|----------------|------|
| Standalone | `true` | `127.0.0.1` | Nessun login: chiunque raggiunga la porta è admin. Solo uso locale. |
| Portal (SSO) | `false` | `0.0.0.0` | Richiede `PRAMAIA_JWT_SECRET` identico a quello del Portal |

Per cambiare modalità dopo l'installazione: modificare `.env` e riavviare il servizio.

> ⚠️ Non esporre mai in rete una installazione in modalità Standalone.

---

## 2. Installazione / aggiornamento (ordine corretto)

| Passo | Cosa succede |
|-------|----------------|
| 1 | **Stop servizio + kill processi** (`PrepareToInstall`, obbligatorio *prima* della copia file) |
| 2 | Copia exe, frontend, nssm, documentazione (il vecchio `frontend\` viene rimosso) |
| 3 | Prima installazione: creazione `.env` dalle risposte del wizard |
| 4 | Permessi ristretti su `.env` e `data\` (solo SYSTEM e Administrators) |
| 5 | (Opzionale) regola firewall, poi installazione e avvio del servizio via NSSM |

Gli aggiornamenti preservano `.env` e `data\`. Se una nuova versione introduce variabili nuove, hanno un default nel codice; il confronto con un `.env` di riferimento va fatto a mano.

### Installazione silenziosa

```powershell
.\PramaIA-LicServer-Setup-1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART `
  /MODE=portal /PORT=8030 /PORTALURL=http://portal:3080 `
  /PORTALAPIURL=http://portal:8091 /JWTSECRET=<secret> /TASKS="installservice,firewall"
```

`/MODE` vale `standalone` (default) o `portal`; in modalità `portal` `/JWTSECRET` è obbligatorio (l'installazione si interrompe senza). Il secret sul command line è visibile nella lista processi: preferire il wizard su macchine condivise.

---

## 3. ⚠️ Chiavi di firma: non perderle

Le licenze sono firmate con la chiave privata in `data\keys\license_private_key.pem`, generata al **primo avvio** se assente. Se il server viene installato in sostituzione di uno esistente **e le licenze già emesse devono restare valide**:

1. Installare senza avviare il servizio (deselezionare "Installa come servizio")
2. Copiare `license_private_key.pem` e `license_public_key.pem` in `{app}\data\keys\` e, se serve, `pramaia-licserver.db` in `{app}\data\`
3. Avviare il servizio

Se le chiavi vengono rigenerate, tutte le licenze precedenti risultano non valide. Fare backup periodico di tutta la cartella `data\`.

---

## 4. Errore ricorrente: `WinError 10048` (porta occupata)

```text
[Errno 10048] error while attempting to bind on address ('0.0.0.0', 8030)
```

Causa quasi sempre un **doppio avvio**: il servizio è già in esecuzione e si lancia anche `start-service.cmd` (o un secondo exe). Prima verifica se il servizio è già sano:

```powershell
Get-Service PramaIA-LicServer
Invoke-RestMethod http://127.0.0.1:8030/api/health   # {"status":"ok","service":"pramaia-licserver"}
```

Se risponde, il servizio va bene: l'errore è del secondo tentativo. Se non risponde:

```powershell
Stop-Service PramaIA-LicServer -Force -ErrorAction SilentlyContinue
taskkill /F /IM PramaIA-LicServer.exe 2>$null
Start-Sleep -Seconds 2
Start-Service PramaIA-LicServer
```

Due processi `PramaIA-LicServer.exe` in Task Manager sono **normali** (bootloader PyInstaller + worker).

### Regole per chi modifica `installer.iss`

1. Stop servizio in `PrepareToInstall` (prima dei file), mai solo in `[Run]`
2. Mai avviare `start-service.cmd` insieme a `nssm start`
3. Il `.env` si crea solo se assente e **mai** va incluso nei `[Files]` (conterrebbe segreti)
4. Dopo ogni modifica al comportamento del wizard, aggiornare questo file

---

## 5. Gestione e verifica

```powershell
Get-Service PramaIA-LicServer
Get-Content "C:\Program Files\PramaIA\LicServer\logs\licserver.log" -Tail 30
Restart-Service PramaIA-LicServer      # dopo ogni modifica a .env
```

### Registrazione sul Portal

`register_to_portal.py` richiede Python e **non** è incluso nell'installer. Eseguirlo da una macchina di sviluppo con un `.env` che punti a questo server (`BACKEND_PORT`/`FRONTEND_PORT` = porta scelta): l'URL registrato sarà `http://localhost:<porta>`, da correggere dall'interfaccia admin del Portal se il server è raggiunto con un altro hostname.

---

## 6. Build installer (sviluppatori)

Prerequisiti: `.venv` con `requirements.txt`, Node.js/npm, [Inno Setup 6](https://jrsoftware.org/isdl.php), `installer\nssm.exe` (64-bit).

```powershell
.\installer\build-release.ps1 -Version "1.0.0"
# opzioni: -SkipFrontend -SkipBackend -SkipInstaller -InnoSetupPath <ISCC.exe>
```

La versione viene passata a Inno Setup con `/DMyAppVersion` (il `.iss` non viene riscritto). `.env`, `keys\` e il database di sviluppo **non** vengono mai inclusi.

---

## 7. Riepilogo errori tipici

| Errore | Causa | Rimedio |
|--------|-------|---------|
| File in uso / accesso negato su exe o `nssm.exe` | Servizio ancora in esecuzione durante la copia | `PrepareToInstall`, oppure stop manuale admin prima del setup |
| `WinError 10048` | Due bind sulla stessa porta | Vedi §4 |
| Pagina bianca / 401 in modalità Portal | Accesso senza token, o secret diverso dal Portal | Entrare dal Portal; verificare `PRAMAIA_JWT_SECRET` |
| Servizio non parte | `.env` mancante/errato | `logs\licserver.log` e `logs\service-error.log` |
| Licenze emesse non più valide | Chiavi rigenerate | Ripristinare `data\keys` dal backup (§3) |

---

*Documento operativo installer. Aggiornare a ogni release che cambia stop/start, task o wizard.*
