import { authGuard } from './authGuard';

const BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authGuard.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // In standalone mode (no token), don't treat 401 as session expiry
  if (response.status === 401 && token) {
    authGuard.logout();
    throw new ApiError(401, 'Session expired');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, err.detail || 'Request failed');
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
  
  // Download file as blob
  downloadJson: async (path: string, filename: string): Promise<void> => {
    const token = authGuard.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(`${BASE_URL}${path}`, { headers });
    if (!response.ok) throw new Error('Download failed');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};
