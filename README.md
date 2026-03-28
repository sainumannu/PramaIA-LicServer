# PramaIA Licensing Server

🔑 Server per la gestione delle licenze PramaIA

---

## 🚀 Quick Start

### 1. Configurazione

Copia il template delle variabili d'ambiente e configura i parametri:

```powershell
Copy-Item .env.template .env
```

**IMPORTANTE**: Imposta `PRAMAIA_JWT_SECRET` nel file `.env` — deve corrispondere allo stesso valore usato dal Portal.

### 2. Installazione dipendenze

**Backend**:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Frontend**:
```powershell
cd frontend
npm install
cd ..
```

### 3. Avvio applicativo

Usa lo script di avvio rapido:
```powershell
.\start-all.ps1
```

Oppure avvia manualmente:
- Backend: `uvicorn backend.main:app --reload --port 8030`
- Frontend: `cd frontend && npm start`

### 4. Registrazione sul Portal

Per rendere l'applicativo accessibile tramite PramaIA-Portal, esegui:

```powershell
python register_to_portal.py
```

Lo script ti guiderà nel processo di registrazione automatica.

---

## 📁 Struttura progetto

```
pramaia-licserver/
├── backend/
│   ├── routers/         # Endpoint FastAPI
│   ├── services/        # Logica di business
│   ├── models/          # Modelli SQLAlchemy
│   ├── db/              # Database config e init
│   └── auth/            # JWT validation (Portal SSO)
├── frontend/
│   ├── src/
│   │   ├── pages/       # Pagine React (Home, Licenses, Customers, Settings)
│   │   ├── components/  # Componenti riutilizzabili
│   │   └── services/    # API client e authGuard
│   └── public/
├── keys/                # Chiavi RSA per firma licenze (auto-generate)
├── mind_integration/    # Client PramaIA-Mind (opzionale)
└── register_to_portal.py
```

---

## 🔑 Gestione Licenze

Il sistema offre una gestione completa delle licenze software:

### Funzionalità Principali

- **Creazione Licenze**: Form completo per emettere nuove licenze con moduli, limiti utenti/istanze, scadenza
- **Ricerca e Filtri**: Ricerca per ID, cliente, P.IVA con filtri per stato
- **Download File Firmato**: Genera file `.lic.json` firmati digitalmente
- **Verifica Firma**: Carica un file licenza per verificarne l'autenticità

### Pagine Frontend

| Pagina | URL | Descrizione |
|--------|-----|-------------|
| Dashboard | `/` | Statistiche e accesso rapido |
| Licenze | `/licenses` | Elenco, creazione, download licenze |
| Clienti | `/customers` | Anagrafica clienti |
| Impostazioni | `/settings` | Configurazioni app (admin) |

---

## ✍️ Firma Digitale

I file di licenza sono firmati digitalmente con RSA-SHA256 per garantire l'autenticità.

### Struttura File Licenza Firmato

```json
{
  "license": {
    "license_id": "LIC-PA-2026-XXXX",
    "customer": { "name": "...", "vat_or_cf": "..." },
    "entitlements": { "modules": [...], "max_users": 10, "max_instances": 1 },
    "validity": { "expires_at": "2027-03-26", ... },
    "status": "active"
  },
  "signature": "BASE64_ENCODED_SIGNATURE",
  "signed_at": "2026-03-26T10:00:00Z",
  "key_fingerprint": "a1b2c3d4e5f6...",
  "algorithm": "RSA-SHA256"
}
```

### Gestione Chiavi

Le chiavi RSA vengono generate automaticamente al primo avvio in `./keys/`:
- `license_private_key.pem` - **NON COMMITARE MAI!**
- `license_public_key.pem` - Da distribuire ai client per verifica

Per rigenerare le chiavi (invalida tutte le licenze precedenti):
```
POST /api/license-files/regenerate-keys (solo Admin)
```

### API Endpoint

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/license-files/{id}/download` | GET | Scarica file firmato |
| `/api/license-files/verify` | POST | Verifica firma (pubblico) |
| `/api/license-files/public-key` | GET | Ottieni chiave pubblica (pubblico) |

---

## 👥 Gestione Clienti

Anagrafica clienti con supporto per:
- Dati anagrafici completi (ragione sociale, P.IVA/CF)
- Contatti (email, telefono, PEC)
- Indirizzo (via, città, CAP, provincia)
- Fatturazione elettronica (codice SDI)
- Ricerca e paginazione
- Soft delete (disattivazione)

---

## 🔐 Autenticazione

L'autenticazione è gestita centralmente dal **PramaIA-Portal** tramite JWT.

- Il token JWT è emesso e validato dal Portal
- L'utente viene reindirizzato al Portal per il login
- Nessun form di login locale — l'auth è sempre SSO

**Mai modificare** `backend/auth/portal_jwt.py` senza coordinamento con il team Platform.

📖 **Per dettagli completi su SSO, multi-tenancy e permessi, vedi [PORTAL_INTEGRATION.md](PORTAL_INTEGRATION.md)**

---

## 🛠️ Sviluppo

### Aggiungere un nuovo endpoint

1. Crea un router in `backend/routers/`
2. Implementa la logica in `backend/services/`
3. Se serve persistenza, aggiungi un modello in `backend/models/`
4. Registra il router in `backend/main.py`

### Aggiungere una nuova pagina

1. Crea il componente in `frontend/src/pages/`
2. Aggiungi la route in `frontend/src/App.tsx`
3. Chiama le API tramite `services/apiClient.ts`

---

## 🧪 Testing

**Backend**:
```powershell
pytest
```

**Frontend**:
```powershell
cd frontend
npm test
```

---

## 🐳 Docker

Avvia l'intero stack con Docker Compose:

```powershell
docker-compose up --build
```

- Backend: http://localhost:8030
- Frontend: http://localhost:3030

---

## 📚 Risorse

- [PramaIA-Portal](https://github.com/sainumannu/PramaIA-Portal) - Autenticazione e gestione app
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Docs](https://react.dev/)

---

## 📝 Note

- **Database**: SQLite (`pramaia-licserver.db`), le tabelle vengono create automaticamente all'avvio
- **CORS**: Configurato per accettare richieste dal Portal e dal frontend locale
- **Porte**: Backend 8030, Frontend 3030
---

## 🐞 Troubleshooting

### Errore "PRAMAIA_JWT_SECRET not set"
→ Imposta la variabile in `.env` con lo stesso valore del Portal

### Token JWT non valido
→ Controlla che `PRAMAIA_JWT_SECRET` sia identico tra Portal e questa app

### Frontend non si connette al backend
→ Verifica che `REACT_APP_BACKEND_URL` in `docker-compose.yml` punti correttamente al backend

---

**Generato da**: PramaIA-AppTemplate  
**Autore**: PramaIA Team
