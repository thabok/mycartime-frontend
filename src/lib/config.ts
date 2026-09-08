/**
 * Single source of truth for the backend origin. Defaults to the current
 * page's hostname on the backend's default dev port (see
 * backend/src/config.py PORT), but can be overridden via VITE_BACKEND_URL
 * (e.g. for pointing a local frontend at a remote/staging backend).
 */
export function getBackendUrl(): string {
  const override = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (override) return override;
  return `http://${window.location.hostname}:1338`;
}
