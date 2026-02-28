/**
 * ─────────────────────────────────────────────────────────────────────────────
 * API Client Helper
 *
 * All frontend pages call the StakeGuard API through this helper.
 * In development it falls back to same-origin (empty string).
 * In production the frontend calls the Railway-hosted API.
 *
 *   NEXT_PUBLIC_API_URL=https://stakeguard-api.up.railway.app
 *
 * Usage:
 *   import { apiUrl, apiFetch } from '@/lib/api';
 *   const res = await apiFetch('/api/v1/rooms');
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

/**
 * Build a full URL for an API endpoint.
 *   apiUrl('/api/v1/rooms')  →  'https://stakeguard-api.up.railway.app/api/v1/rooms'
 *   apiUrl('/api/v1/rooms')  →  '/api/v1/rooms'  (when env is empty / same origin)
 */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${cleanPath}`;
}

/**
 * Convenience wrapper around fetch() that:
 *  - Prepends the API base URL
 *  - Sets Content-Type to JSON by default
 *  - Includes the API key header when configured
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = apiUrl(path);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  // Include API key if configured
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  return fetch(url, {
    ...init,
    headers,
  });
}
