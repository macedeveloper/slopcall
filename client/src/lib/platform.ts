export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function defaultServerUrl(): string {
  const fromEnvironment = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  return fromEnvironment && fromEnvironment.length > 0 ? fromEnvironment : 'ws://127.0.0.1:8787';
}

export function normalizeServerUrl(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}
