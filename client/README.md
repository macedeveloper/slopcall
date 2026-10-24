# Slopcall client

Tauri 2 + Svelte 5 desktop client for Slopcall. The root [README](../README.md) covers
the full project; this file only describes the client.

## Development

```powershell
npm install
npm run dev            # browser UI at http://127.0.0.1:1420
npm run tauri dev      # real desktop shell with tray and hotkeys
```

The client expects the server on `ws://127.0.0.1:8787` by default. Change it in
**Settings → Server** or set `VITE_SERVER_URL` before building:

```powershell
$env:VITE_SERVER_URL = "ws://31.77.9.218:8787"
npm run tauri build
```

## Layout

- `src/lib/state.svelte.ts` - app state, connection lifecycle, settings.
- `src/lib/realtime.ts` - WebSocket protocol client.
- `src/lib/voice.ts` - WebRTC full-mesh voice, mute/deafen, per-user volume.
- `src/components/` - onboarding, sidebar, chat, voice panel, settings, toasts.
- `src-tauri/` - tray menu, global shortcuts, single instance, close-to-tray.
- `scripts/smoke.mjs` - two-client end-to-end smoke test.

## Checks

```powershell
npm run check          # svelte-check + TypeScript
npm run test:e2e       # needs the server and Vite dev server running
```

The NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.
