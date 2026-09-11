/**
 * Single source of truth for the backend origin. Defaults to the current
 * page's hostname on the backend's default dev port (see
 * backend/src/config.py PORT), but can be overridden via VITE_BACKEND_URL
 * (e.g. for pointing a local frontend at a remote/staging backend).
 */
let resolvedBackendUrl: string | null = null;

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function getBackendUrl(): string {
  if (resolvedBackendUrl) return resolvedBackendUrl;
  const override = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (override) return override;
  return `http://${window.location.hostname}:1338`;
}

/**
 * Must run before anything calls getBackendUrl. In the packaged app the sidecar
 * falls back to a random free port when 1338 is taken, so the Rust side is the
 * only thing that knows where the backend actually ended up.
 */
export async function initBackendUrl(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  const port = await invoke<number>('backend_port');
  resolvedBackendUrl = `http://127.0.0.1:${port}`;
}
