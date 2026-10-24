This is the next steps for Slopcall. Read `prompt.md` and add new features to the app. (Ask what steps to do). If you have questions - ask them first. Do not read `prompt (MVP).txt` as it is outdated.

I'll provide you 


# Project
Name: Slopcall
Description: Mini Discord x TeamSpeak clone that just works.



# TO-DO list

## Already added:
- Hotkeys for: Microphone disabling, Audio on/off.
- Volume settings for each user in call.
- Calls & Group calls
- Messages
- Nickname choosing
- Actions on RMB on tray icon
- [x] Sound effects for muting, unmuting, connecting into voice, failing to connect, user joined, new user message, calls, etc. (placeholders)
- [x] Emojis (Contestmoji bundled locally, with native system emoji fallback)
- [x] App icon and dynamic tray icons from `icons/` (inactive, in call, speaking, mic muted, audio muted)
- [x] Contestmoji picker grouped by type (faces, cats, hearts, flags, buttons, music, nature, objects, symbols)
- [x] New Slopcall logo across onboarding, sidebar, splash, favicon, and executable/tray icons
- [x] Profile pictures (custom image, synchronized to chat and voice)
- [x] Markdown in messages (bold, italic, strikethrough, inline code, safe links)
- [x] File sending (256 MB per-file cap; files above 32 MB expire after 7 days, others after 30 days)
- [x] Typing status (“Alice is typing…”)
- [x] Reactions
- [x] Edit and delete messages (author-only, with an edited marker and a deleted placeholder)
- [x] Microphone selection in Settings (persisted, live switch during calls)
- [x] Multiline messages (Enter sends, Shift+Enter inserts a newline, auto-growing composer)
- [x] Image previews for WebP, JPEG XL, and QOI (JXL via a bundled WASM decoder, QOI via an in-repo decoder; SVG stays downloadable for safety)

## From `merge.md` (23.10.2026)
- [x] Paste images and files with Ctrl+V
- [x] Fix image cropping (keep the original aspect ratio, do not cover-crop attachments)
- [ ] Re-sort Contestmoji to match `macestudios.ru/contestmoji`
- [ ] Replies to messages
- [x] Big emojis when a message contains only emojis
- [x] Group consecutive messages from the same user (one avatar and nickname)
- [x] Clickable plain links (not only Markdown links)
- [x] Show who reacted to a message
- [ ] Auto-update the desktop app
- [ ] Notifications

## Fun tab
- [x] `Dynamic Force` — italic with a top-to-bottom gradient `#ffff00` → `#ff7f00`
- [x] `PcBoy` / `Pcboy` / `PCBoy` (and variants ending in `800`, e.g. `PcBoy800`) — bold with a top-to-bottom gradient `#ffffff` → `#dfdfdf`
- [x] `InkFusion` / `Inkfusion` — bold; `Ink` colored `#745793`, `Fusion` colored `#a1a3b4`
- [x] `The Ultimate Contest` / `TUC` — bold, colored `#24e34e`
- [x] These text effects are case-insensitive.

## TO-DO. Later features (do not build yet):
- Two separate message notification sounds: one when the app is focused and one when it is unfocused. Add a setting to enable message sounds while focused.
- Full call invite flow: invite a user, ringing, accept/decline.
- Encryption (secure secret messaging and calls)
- tray animation when talking (slopcall_tray_call, slopcall_tray_speaking_1, slopcall_tray_speaking_2, slopcall_tray_speaking_1)
- Screensharing
- Ping users
- Create file `steal_those.md` and write to it features that makes teamspeak or discord better than slopcall. Don't write features that wouldn't make sence they were if added to slopcall.
- Перенести туду лист в отдельный файл. (это я сделаю сам)

# super extra features (do not build yet)
- AI Chatbot
- If message is in morse code then it plays the audio of the morse code like on telegraph. (minimum length is 3 morse-letters)



# Criteria and info:
- Project should be lightweight and easily runnable on slow devices (Client) and our ubuntu server (`server_characteristics.txt`)
- User can only be in one call at a time.
- Should support English and Russian languages.
- Should sit in tray like Discord.
- I will deploy on server through filezilla and ssh connection. (there is no script setted up)
- Frontend framework is up to you. It should be able to satisfy design criteria, be lightweight, fast and unintrusive.
- Voice transport: P2P mesh (WebRTC, no media server) — simplest, cheapest, but CPU/bandwidth grow with `n^2` and it degrades past ~4–6 users.
- Voice architecture and max room size? I don't think there would be more than 8 people in the room at once, but let's cap at 12 just in cape.
- How many concurrent users overall should the server survive? 32 ig
- Should messages persist across restarts? yeah
- Should the agent deploy to the server, or only produce a runnable repo? agent should tell me how to set this up on server. pick implementation that is easy to set up.

# Release versioning (do not forget)
- **Bump the patch version on every release** (client installer and/or server deploy): `0.1.0` → `0.1.1` → `0.1.2`, etc.
- Keep these files in sync: `client/package.json`, `client/src-tauri/tauri.conf.json`, `client/src-tauri/Cargo.toml`, `server/package.json`.
- Never ship a new build under the same version as the previous one — this makes it impossible to tell builds apart.
- Record the new version and installer SHA-256 in `done.md`. The installer filename must include the version (`Slopcall_<version>_x64-setup.exe`).
- Current version after Step 2: `0.1.0`. The next release must be `0.1.1`.



# Hard constraints (target server)
- OS: Ubuntu 26.04.1 LTS, x86_64.
- CPU: 1 vCPU Intel Xeon E5-2699 v4.
- RAM: 2 GB DDR4 (shared).
- Disk: 30 GB NVMe (shared).
- Network: up to 5 Gbit/s, L3–L4 DDoS protection.
- Path on server: `/home/slopcall` (sftp://root@31.77.9.218/home/slopcall).
- **Already running on this box:** AmneziaVPN + Telegram bots, managed via **pm2**.
  - You MUST NOT disturb or restart existing pm2 processes.
  - May you install system packages? yeah why not



# Design (for client app):

## Rules
- Use Apple's design principles. (search in web)
- Minimalistic, easy to understand, functional.
- Slight shadows for elevation.
- Apple HIG + Material Design 3 as reference — but for MVP, "no pretty UI, no animations" applies first. Design tokens below are for structure; polish is post-MVP.
- Concrete targets to follow (instead of "search the web"): 8px spacing grid, minimum 44x44px hit targets, one accent color, elevation via shadow not borders, visible focus states.
- Rounded edges

## Colors:
| Role | Hex | Use |
| --- | --- | --- |
| Base (page background) | `#18181c` | App background |
| Elevated (level 2) | `#26262a` | Panels, cards, sidebar |
| High (level 3) | `#353539` | Inputs, hover states |
| Top (level 4) | `#444449` | Modals, popovers, raised elements |
| Special | `#77777c` | Borders, dividers, disabled state, selections |
| Accent (orange) | `#ff7a15` | Primary actions, active state, focus ring |

## Additional colors:
#E52B3B (red, for errors etc.)
#F7D023 (yellow)
#30D557 (green, for online / speaking indicator / success)
#178cf2 (blue. for info, links or stuff)
#7a15ff (purple)
#EA508E (pink)

## Font:

### Main font:
Name: Geist (provided in project folder)
Line height: Auto
Letter spacing: -5%
Heading (48px)
Subheading (30px)
Regular text (18px)

### Code font (if needed):
Name: `Monaspace Neon Var` (provided in project folder)
Size: 16px

## Buttons:
Font size: 18px
Padding: 20h 8v
Font weight: 600 (bold)
Icons: use bootstrap-icons as a vendored subset, not the full set.

## Animations
- Minimal, short (100–200ms), ease-in-out, snappy.
- Apple's animation principles.
- For MVP: minimal only; do not spend time here.
