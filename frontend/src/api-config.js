// Centralized API base URL resolution.
//
// In local dev, Vite's dev-server proxy forwards "/api/*" to your backend
// (see vite.config.js), so a relative path works fine there.
//
// In a production static deploy (e.g. Railway), the frontend is served by
// itself with no proxy — a relative "/api/*" request hits the frontend's
// own host, not the backend, and silently fails (you get the frontend's
// HTML fallback page back instead of JSON).
//
// To fix that, set VITE_API_URL at BUILD time to your backend's public URL,
// e.g.:
//   VITE_API_URL=https://your-backend.up.railway.app npm run build
// (On Railway, set this as a build-time environment variable on the
// frontend service.)
//
// If VITE_API_URL isn't set, we fall back to a relative path, which only
// works when a reverse proxy / dev server is forwarding /api for you.

const RAW_BASE = import.meta.env.VITE_API_URL || ''

// Strip any trailing slash so we don't end up with "//api/..."
export const API_BASE = RAW_BASE.replace(/\/+$/, '')

export function apiUrl(path) {
  return `${API_BASE}${path}`
}
