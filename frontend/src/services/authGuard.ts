/**
 * authGuard — gestisce autenticazione opzionale con PramaIA Portal.
 *
 * In modalità standalone (senza Portal), fornisce un utente admin di default.
 * Con Portal SSO, legge il token JWT dal query param ?token=<JWT> o localStorage.
 */

const TOKEN_KEY = 'pramaia_token';
const USER_KEY = 'pramaia_user';

// Utente admin di default per modalità standalone
const DEFAULT_ADMIN_USER: PortalUser = {
  sub: 'local-admin',
  email: 'admin@localhost',
  display_name: 'Admin Locale',
  roles: ['admin'],
  apps: ['pramaia-licserver'],
  is_admin: true,
  tenant_id: 'default',
  tenants: ['default'],
  tenant_role: 'global_admin',
  app_admin_for: ['pramaia-licserver'],
};

export interface PortalUser {
  sub: string;
  email: string;
  display_name: string;
  roles: string[];
  apps: string[];
  is_admin: boolean;
  tenant_id?: string;
  tenants?: string[];
  tenant_role?: string; // 'global_admin' | 'admin' | 'member'
  app_admin_for?: string[];
}

function parseJwtPayload(token: string): PortalUser | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return {
      sub: payload.sub,
      email: payload.email,
      display_name: payload.display_name || payload.email,
      roles: payload.roles || [],
      apps: payload.apps || [],
      is_admin: (payload.roles || []).includes('admin'),
      tenant_id: payload.tenant_id,
      tenants: payload.tenants || [],
      tenant_role: payload.tenant_role,
      app_admin_for: payload.app_admin_for || [],
    };
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const base64 = token.split('.')[1];
    const payload = JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export const authGuard = {
  /**
   * Chiama questo all'avvio dell'app per raccogliere il token
   * dal query param ?token= (redirect dal Portal) o dal localStorage.
   */
  init(): void {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    if (tokenFromUrl) {
      localStorage.setItem(TOKEN_KEY, tokenFromUrl);
      const user = parseJwtPayload(tokenFromUrl);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      // Rimuove il token dall'URL per sicurezza
      params.delete('token');
      const newUrl = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getCurrentUser(): PortalUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      // Modalità standalone: restituisce utente admin di default
      return DEFAULT_ADMIN_USER;
    }
    try { return JSON.parse(raw); } catch { return DEFAULT_ADMIN_USER; }
  },

  isAuthenticated(): boolean {
    // In modalità standalone, sempre autenticato
    const token = this.getToken();
    if (!token) return true; // Standalone mode
    return !isTokenExpired(token);
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // In standalone, ricarica semplicemente la pagina
    window.location.href = '/';
  },
};

// Inizializza subito all'import
authGuard.init();

/**
 * Verifica se l'utente corrente può accedere alle impostazioni dell'app.
 * Ritorna true se:
 * - È Global Admin (is_admin = true)
 * - È App Admin per questa app (app_admin_for contiene l'app_id)
 * - È Tenant Admin (tenant_role = 'admin')
 */
export function canAccessSettings(): boolean {
  const user = authGuard.getCurrentUser();
  if (!user) return false;
  
  // Global admin
  if (user.is_admin) return true;
  
  // Tenant admin
  if (user.tenant_role === 'admin' || user.tenant_role === 'global_admin') return true;
  
  // App admin per questa app
  const appId = process.env.REACT_APP_APP_ID || 'pramaia-licserver';
  if (user.app_admin_for?.includes(appId)) return true;
  
  return false;
}
