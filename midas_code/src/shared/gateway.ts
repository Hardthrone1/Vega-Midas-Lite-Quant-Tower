// src/shared/gateway.ts
// Single source of truth for how the dashboard reaches the Vega Gateway.
//
// Local dev  : Vite on :5173, gateway on :8001 → absolute URL, cross-origin.
// Deployed   : the gateway serves this bundle itself, so the API is same-origin
//              and GATEWAY_URL is '' (requests go to /api/... relative).
//
// Set VITE_GATEWAY_URL to override; set VITE_VEGA_KEY to match the gateway's
// VEGA_API_KEY when the deployment is locked down.

const RAW = import.meta.env.VITE_GATEWAY_URL as string | undefined

export const GATEWAY_URL =
  RAW !== undefined
    ? RAW.replace(/\/$/, '')
    : import.meta.env.DEV
      ? 'http://127.0.0.1:8001'
      : '' // same-origin in a production build

const VEGA_KEY = import.meta.env.VITE_VEGA_KEY as string | undefined

/** Absolute (or same-origin relative) URL for a gateway path. */
export function gatewayUrl(path: string): string {
  return `${GATEWAY_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** fetch() against the gateway with the shared secret attached when configured. */
export function gatewayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (VEGA_KEY) headers.set('X-Vega-Key', VEGA_KEY)
  return fetch(gatewayUrl(path), { ...init, headers })
}
