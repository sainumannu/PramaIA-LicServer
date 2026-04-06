# Guida al Sistema di Licenze PramaIA

Questa guida descrive tutte le modalità di utilizzo del sistema di licenze PramaIA-LicServer.

---

## 📋 Indice

1. [Panoramica](#panoramica)
2. [Struttura della Licenza](#struttura-della-licenza)
3. [Modalità Legacy (Singola App)](#modalità-legacy-singola-app)
4. [Modalità Multi-App](#modalità-multi-app)
5. [Limiti e Entitlements](#limiti-e-entitlements)
6. [Stati della Licenza](#stati-della-licenza)
7. [Tipi di Deployment](#tipi-di-deployment)
8. [Flussi Operativi](#flussi-operativi)
9. [API Endpoints](#api-endpoints)
10. [Esempi Pratici](#esempi-pratici)

---

## Panoramica

Il sistema supporta due modalità operative:

| Modalità | Uso Consigliato | Caratteristiche |
|----------|-----------------|-----------------|
| **Legacy** | Licenza per singola app | Semplice, limiti globali (`max_users`, `max_instances`) |
| **Multi-App** | Licenze enterprise multi-prodotto | Entitlements per-app, limiti per ruolo, limiti globali |

---

## Struttura della Licenza

Una licenza completa contiene:

```json
{
  "license": {
    "license_id": "LIC-PA-2026-XXXX",
    "customer": { "name": "...", "vat_or_cf": "..." },
    "entitlements": { ... },        // Legacy
    "apps_entitlements": { ... },   // Multi-App
    "global_limits": { ... },       // Limiti globali
    "environment": { ... },
    "validity": { ... },
    "status": "active"
  },
  "signature": "...",
  "signed_at": "2026-03-28T...",
  "key_fingerprint": "...",
  "algorithm": "RSA-SHA256"
}
```

---

## Modalità Legacy (Singola App)

### Quando usarla
- Licenza per una singola applicazione
- Struttura semplice con limiti globali
- Retrocompatibilità con sistemi esistenti

### Campi `entitlements`

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `modules` | `string[]` | Moduli abilitati (es. `["albo", "protocollo"]`) |
| `max_users` | `int` | Numero massimo di utenti totali |
| `max_instances` | `int` | Numero massimo di installazioni |
| `max_version` | `string?` | Versione massima consentita (es. `"2.x"`) |

### Esempio Legacy

```json
{
  "entitlements": {
    "modules": ["albo", "protocollo", "notifiche"],
    "max_users": 50,
    "max_instances": 2,
    "max_version": "3.x"
  }
}
```

---

## Modalità Multi-App

### Quando usarla
- Licenze enterprise con più prodotti
- Limiti differenziati per ruolo utente
- Controllo granulare per applicazione

### Struttura `apps_entitlements`

```json
{
  "apps_entitlements": {
    "<app_id>": {
      "enabled": true,
      "modules": ["modulo1", "modulo2"],
      "users": {
        "admin": 5,
        "standard": 45,
        "viewer": 100
      },
      "max_instances": 3,
      "features": {
        "advanced_reports": true,
        "api_access": true
      }
    }
  }
}
```

### Campi per App

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `enabled` | `bool` | Se l'app è abilitata nella licenza |
| `modules` | `string[]` | Moduli abilitati per questa app |
| `users` | `object` | Limiti utenti per ruolo |
| `max_instances` | `int` | Istanze massime per questa app |
| `features` | `object?` | Feature flags app-specifici |

### Ruoli Utente Predefiniti

| Ruolo | Descrizione | Permessi Tipici |
|-------|-------------|-----------------|
| `admin` | Amministratori | Accesso completo, configurazione |
| `standard` | Utenti operativi | Lettura/scrittura dati |
| `viewer` | Utenti in sola lettura | Solo visualizzazione |

> **Nota**: È possibile aggiungere ruoli custom. Il valore `-1` indica "illimitato".

---

## Limiti e Entitlements

### Limiti Globali (`global_limits`)

Applica restrizioni a tutto il sistema, indipendentemente dalle singole app:

```json
{
  "global_limits": {
    "max_total_users": 500,
    "max_concurrent_sessions": 100,
    "max_tenants": 5,
    "max_api_calls_per_day": 10000
  }
}
```

| Limite | Descrizione |
|--------|-------------|
| `max_total_users` | Utenti totali su tutte le app |
| `max_concurrent_sessions` | Sessioni attive contemporanee |
| `max_tenants` | Tenant/organizzazioni separate |
| `max_api_calls_per_day` | Rate limiting API giornaliero |

### Gerarchia dei Limiti

```
┌─────────────────────────────────────┐
│         GLOBAL LIMITS               │
│   (max_total_users: 500)            │
├─────────────────────────────────────┤
│  App A          │  App B            │
│  users: 200     │  users: 300       │
│  instances: 3   │  instances: 5     │
└─────────────────────────────────────┘
```

Il sistema valida **entrambi** i livelli: prima i limiti per-app, poi quelli globali.

---

## Stati della Licenza

| Stato | Codice | Descrizione |
|-------|--------|-------------|
| 🟡 **Pending** | `pending` | Richiesta di attivazione in attesa |
| 🟢 **Active** | `active` | Licenza valida e operativa |
| 🔴 **Expired** | `expired` | Periodo di validità terminato |
| ⛔ **Revoked** | `revoked` | Revocata manualmente (es. mancato pagamento) |
| ⚪ **Deactivated** | `deactivated` | Disattivata dal cliente |
| 🟠 **Suspended** | `suspended` | Sospesa temporaneamente |

### Transizioni di Stato

```
┌─────────┐    Approvazione    ┌────────┐
│ PENDING │ ────────────────▶ │ ACTIVE │
└─────────┘                    └────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
   ┌──────────┐            ┌─────────────┐           ┌─────────────┐
   │ EXPIRED  │            │ DEACTIVATED │           │  REVOKED    │
   │ (auto)   │            │ (cliente)   │           │  (admin)    │
   └──────────┘            └─────────────┘           └─────────────┘
```

---

## Tipi di Deployment

| Tipo | Codice | Descrizione |
|------|--------|-------------|
| **On-Premise** | `on_prem` | Installazione locale presso il cliente |
| **Cloud** | `cloud` | Servizio SaaS gestito |
| **Hybrid** | `hybrid` | Combinazione on-prem + cloud |

Il tipo di deployment può influenzare:
- Validazione del fingerprint
- Modalità di heartbeat
- Requisiti di connettività

---

## Flussi Operativi

### 1. Emissione Diretta (Admin)

```
Admin GUI ──▶ POST /api/licenses/issue-license ──▶ Licenza Attiva
```

1. Admin compila il form di creazione licenza
2. Specifica cliente, entitlements, scadenza
3. Sistema genera `license_id` (es. `LIC-PA-2026-A1B2`)
4. Licenza salvata con stato `active`
5. Download file `.lic.json` firmato

### 2. Richiesta Attivazione (Self-Service)

```
Cliente ──▶ POST /activate-request ──▶ Pending
                                          │
Admin ──▶ POST /issue-license ◀───────────┘
              (con activation_request_id)
                    │
                    ▼
              Licenza Attiva
```

1. Cliente invia richiesta con dati e fingerprint
2. Sistema crea `ActivationRequest` con stato `pending`
3. Admin visualizza richieste in attesa
4. Admin approva ed emette licenza
5. Cliente riceve notifica/download

### 3. Validazione Runtime

```
App Cliente ──▶ POST /api/licenses/validate ──▶ { valid: true/false }
```

L'applicazione cliente verifica periodicamente:
- Stato licenza (active?)
- Scadenza (expires_at)
- Limiti utenti/istanze
- Moduli abilitati

### 4. Heartbeat (Monitoraggio)

```
App Cliente ──▶ POST /api/licenses/heartbeat ──▶ OK + days_remaining
```

Invio periodico (es. ogni ora) per:
- Tracciare istanze attive
- Monitorare utenti connessi
- Rilevare violazioni limiti

---

## API Endpoints

### Gestione Licenze

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/licenses/issue-license` | Emette nuova licenza |
| `GET` | `/api/licenses/` | Lista tutte le licenze |
| `GET` | `/api/licenses/license/{id}` | Dettaglio licenza |
| `DELETE` | `/api/licenses/{id}` | Elimina licenza (admin) |
| `POST` | `/api/licenses/revoke` | Revoca licenza |

### Ciclo di Vita

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/licenses/activate-request` | Richiedi attivazione |
| `GET` | `/api/licenses/activation-requests` | Lista richieste (admin) |
| `POST` | `/api/licenses/validate` | Valida licenza |
| `POST` | `/api/licenses/heartbeat` | Heartbeat |
| `POST` | `/api/licenses/refresh-license` | Rinnova validità |
| `POST` | `/api/licenses/deactivate` | Disattiva licenza |

---

## Esempi Pratici

### Esempio 1: Licenza PMI Singola App

```json
{
  "customer": {
    "name": "Studio Rossi SRL",
    "vat_or_cf": "12345678901"
  },
  "entitlements": {
    "modules": ["protocollo", "notifiche"],
    "max_users": 10,
    "max_instances": 1
  },
  "validity": {
    "expires_at": "2027-12-31"
  },
  "environment": {
    "deployment_type": "on_prem"
  }
}
```

### Esempio 2: Licenza Enterprise Multi-App

```json
{
  "customer": {
    "name": "Comune di Milano",
    "vat_or_cf": "00000000000"
  },
  "entitlements": {
    "modules": [],
    "max_users": 1,
    "max_instances": 1
  },
  "apps_entitlements": {
    "pramaia-helpdesk": {
      "enabled": true,
      "modules": ["tickets", "sla", "reports"],
      "users": {
        "admin": 5,
        "standard": 50,
        "viewer": 200
      },
      "max_instances": 3,
      "features": {
        "ai_assistant": true,
        "advanced_analytics": true
      }
    },
    "pramaia-inventory": {
      "enabled": true,
      "modules": ["beni", "ammortamenti"],
      "users": {
        "admin": 2,
        "standard": 20,
        "viewer": 50
      },
      "max_instances": 1
    }
  },
  "global_limits": {
    "max_total_users": 300,
    "max_concurrent_sessions": 100
  },
  "validity": {
    "expires_at": "2028-12-31",
    "maintenance_until": "2027-12-31"
  },
  "environment": {
    "deployment_type": "hybrid"
  }
}
```

### Esempio 3: Validazione Multi-App

```json
// POST /api/licenses/validate
{
  "license_id": "LIC-PA-2026-XXXX",
  "app_id": "pramaia-helpdesk",
  "role": "standard",
  "user_counts_by_role": {
    "admin": 4,
    "standard": 48,
    "viewer": 150
  },
  "check_instances": 2
}

// Response
{
  "valid": true,
  "status": "active",
  "message": "License valid for pramaia-helpdesk",
  "expires_at": "2028-12-31",
  "days_remaining": 1005,
  "details": {
    "users_remaining": {
      "admin": 1,
      "standard": 2,
      "viewer": 50
    },
    "instances_remaining": 1
  }
}
```

---

## 🔑 Firma Digitale

Ogni licenza è firmata digitalmente con RSA-SHA256:

1. Il payload `license` viene serializzato in JSON
2. Viene firmato con la chiave privata RSA
3. La firma è codificata in Base64
4. Il file include `key_fingerprint` per verificare la chiave

### Verifica Firma

L'applicazione cliente può verificare l'autenticità:

```python
import json
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

# Carica chiave pubblica (distribuita con l'app)
with open("public_key.pem", "rb") as f:
    public_key = serialization.load_pem_public_key(f.read())

# Verifica firma
license_data = json.dumps(lic_file["license"], separators=(',', ':'))
signature = base64.b64decode(lic_file["signature"])

public_key.verify(
    signature,
    license_data.encode(),
    padding.PKCS1v15(),
    hashes.SHA256()
)
```

---

## 📊 Best Practices

1. **Usa Multi-App per enterprise** - Più controllo, meno licenze da gestire
2. **Imposta global_limits** - Previene abusi cross-app
3. **Abilita heartbeat** - Monitora utilizzo reale
4. **Usa maintenance_until** - Distingui validità da supporto
5. **Revoca vs Elimina** - Usa revoke per audit trail, delete solo per errori

---

## Changelog

| Data | Versione | Note |
|------|----------|------|
| 2026-03-28 | 1.0 | Documentazione iniziale |
