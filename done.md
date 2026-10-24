# Slopcall progress

## 2026-10-23 — Step 1

- [x] Updated `prompt.md`: marked Step 1 items complete, added sound effects / Contestmoji / app-and-tray icons to “Already added”, and added deferred focused message sounds + full call invite flow to later features.
- [x] Generated the Tauri app icon set from `icons/icon_1024.png`; refreshed `client/public/favicon.png`.
- [x] Copied the supplied 32×32 transparent tray icons into `client/src-tauri/icons/tray/`.
- [x] Added dynamic tray icon states (inactive, in call, speaking, mic muted, deafened) with tooltips; added Rust tests for priority, tooltips, decoding, dimensions, and transparency.
- [x] Added 12 generated placeholder WAV sounds in `client/public/sounds/`, `client/scripts/make-sounds.mjs`, and `npm run make:sounds`.
- [x] Wired sound events: mute/unmute, deafen/undeafen, voice join/leave/error, peer join/leave, message while unfocused, reconnects, and disconnects.
- [x] Added Settings sound-effects toggle and volume slider with persistence.
- [x] Vendored 133 Contestmoji SVGs plus 5 aliases with attribution; generated `client/src/lib/contestmoji.ts`.
- [x] Added the Contestmoji picker (search, recent, insert-at-cursor), `:name:` message rendering, and native Unicode emoji fallback.
- [x] Replaced the old sidebar/splash microphone mark with the new app logo.
- [x] Extended the Playwright smoke test: sounds, message focus behavior, emoji insertion/rendering, Unicode emojis, and sound-setting persistence.
- [x] Ran `npm run check` (0 errors / 0 warnings), `npm run build`, and `npm run test:e2e` successfully.
- [x] Built the release NSIS installer: `client/src-tauri/target/release/bundle/nsis/Slopcall_0.1.0_x64-setup.exe` (2.82 MiB / 2,957,073 bytes).
  - SHA-256: `85767BD4DE20C6473EE494E4C43B54FAF403D7B1352B0B4FEBBC1ED83BB3CD29`
- [x] Launched the real release app with WebView2 remote debugging and confirmed it loads with the new branding.
- [x] Confirmed the real tray icon exists with tooltip “Slopcall - mic on, audio on”.
- [x] Confirmed `/sounds/voice-join.wav` is served by the real app (HTTP 200, 27,386 bytes) and playback reaches `ended`.
- [x] Stopped the temporary local server, Vite dev server, and Tauri test app; removed temporary debug scripts.

## 2026-10-23 — Step 2

- [x] Restored completed Step 1 items into “Already added” in `prompt.md` and removed the user’s temporary instruction line.
- [x] Added category metadata to the Contestmoji generator (`faces`, `cats`, `hearts`, `flags`, `buttons`, `music`, `nature`, `objects`, `symbols`) and regenerated all 133 manifest entries.
- [x] Grouped the picker by category with translated EN/RU headings; search results stay flat and “Recently used” stays first.
- [x] Added an e2e assertion that all nine category headings render and that search switches to a single “Results” section.
- [x] Replaced the remaining placeholder brand mic mark in onboarding with `/logo.png`; functional microphone/mute controls still use the mic glyph.
- [x] Removed the unused default Svelte `favicon.svg`; the app uses `/favicon.png`.
- [x] Verified the executable `icon.ico` contains the new orange Slopcall icon.
- [x] Ran `npm run check` (0 errors / 0 warnings) and `npm run test:e2e` successfully.
- [x] Refreshed `docs/screenshots/step1-emoji-picker.png`.
- [x] Added profile pictures: image selection in Settings, center-crop/resize to 256×256 WebP, local persistence, avatar sync over WebSocket, and avatars in chat, sidebar, and voice.
- [x] Added the `profile:update` / `profile:updated` protocol messages and server-side validation for avatar data URLs.
- [x] Extended the smoke test to upload an avatar through Settings and confirm another client receives it.
- [x] Added safe inline Markdown rendering: bold, italic, strikethrough, inline code, and http(s) links; Contestmoji tokens still render inside formatted text.
- [x] Kept Markdown as structured tokens rendered by Svelte (no raw HTML injection) and added it to the smoke test.
- [x] Added file sending with a 256 MB per-file cap, streamed `POST /upload`, and `GET /files/:id` serving with CORS.
- [x] Added expiration cleanup: files above 32 MB expire after 7 days; all others after 30 days.
- [x] Added the composer attachment picker, pending-file chip, upload state, image previews, and downloadable file cards.
- [x] Extended the smoke test to send a PNG and verify the other client receives it and can fetch it from `/files/:id`.
- [x] Added typing status with throttled `text:typing` WebSocket events, per-user expiry timers, and EN/RU labels.
- [x] Extended the smoke test to check that the typing indicator appears and clears after sending.
- [x] Added message reactions with a quick Contestmoji palette, live counts, active-user highlighting, and click-to-toggle behavior.
- [x] Added server-side reaction validation, per-message reaction limits, persisted in-place message updates, and `text:message-updated` broadcasts.
- [x] Extended the smoke test to react from one client, verify the count on the other, and toggle the reaction off.
- [x] Added author-only message editing with an edit banner in the composer, an `edited` marker, and `text:edit` broadcasts.
- [x] Added author-only soft deletion with an inline confirmation, removed the uploaded file from disk, cleared attachments/reactions, and showed a deleted-message placeholder.
- [x] Extended the smoke test to edit a message, verify the edited marker on the other client, delete it, and verify the placeholder.
- [x] Extended the smoke test to delete an attachment message and confirm its file URL returns 404.
- [x] Added a server protocol test for reactions, author-only edits, and soft deletes (7/7 server tests pass).
- [x] Ran `npm run check` (0 errors / 0 warnings), `npm run build`, `npm test`, and the full Playwright smoke suite successfully after the Step 2 features.
- [x] Rebuilt the release NSIS installer after all Step 2 changes: `client/src-tauri/target/release/bundle/nsis/Slopcall_0.1.0_x64-setup.exe` (2.83 MiB / 2,965,800 bytes).
  - SHA-256: `F73E1522463C973AF5B61DC508AEE4ED09C463169C3B61CCD94202D1D25C774A`
- [x] Recorded the release-versioning rule in `prompt.md`: bump the patch version on every release and keep the client/server version files in sync. Current build stays `0.1.0`; the next release must be `0.1.1`.

## 2026-10-23 - merge.md batch + microphone selection

- [x] Merged the `merge.md` list into `prompt.md` and marked the implemented items complete.
- [x] Added case-insensitive Fun text effects: `Dynamic Force`, `PcBoy`/`PcBoy800`, `InkFusion`, and `The Ultimate Contest`/`TUC`.
- [x] Added bare `http(s)` URL auto-linking alongside Markdown links.
- [x] Added big rendering for messages that contain only emoji (Unicode or Contestmoji).
- [x] Grouped consecutive messages from the same user so the avatar and nickname appear once.
- [x] Added reaction author names (per-reaction tooltip plus a visible names line).
- [x] Added Ctrl+V image/file paste into the composer, including generated names for unnamed clipboard images.
- [x] Fixed attachment image cropping by preserving the aspect ratio with `object-fit: contain`.
- [x] Added microphone selection in Settings with device enumeration, persistence in `slopcall.micDevice`, device-change refresh, and live switching via `RTCRtpSender.replaceTrack`.
- [x] Renamed the Settings submit button from "Save and reconnect" to "Save" and corrected the note: only nickname/server changes reconnect and leave voice.
- [x] Ran `npm run check` after the microphone changes: 0 errors / 0 warnings.
- [x] Re-ran `npm run build` after the microphone changes.
- [ ] Re-run the full Playwright smoke suite in an environment where Playwright can reach the local server.
- [ ] Bump `0.1.0` → `0.1.1` in the four version files before the next release and rebuild the installer.

## 2026-10-23 - multiline messages + WebP/JXL/QOI previews

- [x] Replaced the chat composer `<input>` with an auto-growing `<textarea>` (52-180 px).
- [x] Enter sends, Shift+Enter inserts a newline, and IME composition is ignored.
- [x] Preserved line breaks in rendered messages (`white-space: pre-wrap` was already in place).
- [x] Added `ImageAttachment.svelte` with loading and failed-preview states plus EN/RU strings.
- [x] WebP previews use the browser's native decoder.
- [x] JPEG XL previews use a locally vendored `@jsquash/jxl@1.3.0` decoder (Apache-2.0, 849 KB `jxl_dec.wasm`); no runtime npm dependency or CDN call.
- [x] QOI previews use the new in-repo decoder in `client/src/lib/qoi.ts`.
- [x] Image detection now falls back to the file extension, so `.webp`, `.jxl`, and `.qoi` work even when uploads arrive as `application/octet-stream`.
- [x] The server infers image MIME types from extensions and serves JXL/QOI inline.
- [x] Decoder test with generated 1280x800 fixtures: QOI and JXL decoded successfully; WebP loaded natively.
- [x] Verified the rendered chat in the desktop browser: multiline message kept its line break, and QOI/JXL/WebP attachments rendered as images.
- [x] Updated smoke selectors for the textarea and added Shift+Enter / multiline assertions.
- [x] Ran `npm run check` (0 errors / 0 warnings) and `npm run build`.

## 2026-10-23 - automatic settings save

- [x] Language, avatar, sounds toggle, volume, and microphone now save immediately on change.
- [x] Nickname and server URL save on blur, Esc, X, backdrop click, and the Done button.
- [x] Invalid nickname/server values keep the modal open and show an error instead of silently discarding changes.
- [x] Replaced the footer Save/Cancel pair with a single Done button; added `settings.done` in EN/RU.
- [x] Verified in the desktop browser: changing volume wrote `slopcall.soundVolume` and Esc closed the modal; editing the nickname wrote `slopcall.nickname` on blur and Esc closed the modal.
- [x] Re-ran `npm run check` (0 errors / 0 warnings) and `npm run build` after the auto-save changes.
- [x] Added a Diagnostics section to Settings with a "Copy diagnostics" button in EN/RU.
- [x] Diagnostics include app version, server, connection/voice state, ICE servers, microphone permission/device count, WebView/user-agent details, per-peer WebRTC state, and the last 25 connection/voice/error events.
- [x] Added an in-memory event log for connection changes, socket close codes, voice joins/leaves, peer changes, voice errors, error toasts, window errors, and unhandled rejections.
- [x] Added `VoiceManager.debugInfo()` for audio-context/local-track state and reported WebSocket close codes through `RealtimeClient`.
- [x] Verified in the desktop browser: the button reports "Copied", the generated text contains connection and ICE details, and a denied microphone produces a readable voice error in the diagnostics.
- [x] Re-ran `npm run check` (0 errors / 0 warnings) and `npm run build` after the diagnostics changes.
- [ ] Did not bump the version, rebuild the installer, or deploy; those remain release-time steps.

## Next session

- [ ] Visually verify all five tray icon states in the installed/release app (inactive, in call, speaking, mic muted, deafened).
- [ ] Review the rebuilt installer and deploy the updated server/client when ready.
