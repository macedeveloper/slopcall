# Deploying Slopcall

Target: the existing Ubuntu 26.04 server at `31.77.9.218`, path `/home/slopcall`.

**Do not restart or touch the existing pm2 processes.** Slopcall is added as a separate
pm2 app called `slopcall`; no Docker is used.

## 0. Before uploading

Check that port 8787 is free and that nobody is already using that name:

```bash
ss -tlnp | grep -E ':8787|:80|:443' || true
pm2 list
```

If 8787 is taken, pick another port and use it consistently below (and in the client
Settings → Server).

## 1. Upload the server

Upload the `server/` folder via SFTP/FileZilla to `/home/slopcall/server`.
Keep `src/`, `package.json`, `package-lock.json`, and `test/`; uploading `node_modules`
is unnecessary.

Do **not** overwrite the production `server/data/` directory when updating: it contains
messages and uploads. On a fresh install the server creates it automatically.

## 2. Install dependencies and start it

SSH in and run:

```bash
cd /home/slopcall/server
npm ci --omit=dev

# quick sanity check: starts, prints the data directory, then Ctrl+C
node src/index.js

pm2 start src/index.js --name slopcall --time
pm2 save
```

Verify:

```bash
pm2 status
pm2 logs slopcall --lines 30
curl -s http://127.0.0.1:8787/health
```

`pm2 save` stores the current process list, but it does **not** restart the other apps.

## 3. Open the firewall

If a firewall is active:

```bash
ufw allow 8787/tcp
```

The server binds `0.0.0.0:8787` by default.

## 4. Client settings

Install the NSIS installer on Windows and open Slopcall. In **Settings → Server** use:

```
ws://31.77.9.218:8787
```

`ws://` (not HTTPS) is fine for this MVP: the desktop UI is bundled locally, so Windows
does not treat it as an insecure web page and microphone access keeps working. WebRTC
media is still encrypted with DTLS-SRTP; only signaling is plain text.

If you want to change the baked-in default instead of configuring every client, build
with:

```powershell
$env:VITE_SERVER_URL = "ws://31.77.9.218:8787"
cd client
npm run tauri build
```

## Configuration

The server reads `server/.env` if it exists (real environment variables win). Start from
the example:

```bash
cd /home/slopcall/server
cp .env.example .env
nano .env
pm2 restart slopcall
```

Environment variables (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP/WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `server/data` | Message and upload storage directory |
| `TURN_URL` | unset | Comma-separated TURN URLs for restrictive NATs |
| `TURN_USERNAME` | unset | TURN credential |
| `TURN_PASSWORD` | unset | TURN credential |

Apply changes with:

```bash
cd /home/slopcall/server
pm2 restart slopcall --update-env
```

To pass variables through pm2, prefix them:

```bash
TURN_URL=turn:31.77.9.218:3478 pm2 restart slopcall --update-env
```

## Data storage, uploads, and backup

Messages are one JSON line per message in `server/data/<channel>.jsonl`. Uploaded files
live in `server/data/uploads/` as UUID blobs plus `.json` metadata sidecars. Copy the
whole `server/data` directory for backups.

Uploads are capped at 256 MB per file. Files above 32 MB are removed after 7 days; smaller
files after 30 days. Cleanup runs hourly, but the server does not enforce a total disk
quota, so monitor free space on the 30 GB volume.

`POST /upload` and `GET /files/:id` use the same port as the WebSocket. The upload endpoint
is intentionally unauthenticated in the current MVP and allows CORS. Keep that in mind
before exposing the port more widely; add a reverse proxy or token check if the server
becomes public.

Deleting a channel JSONL file clears that channel's message history.

## Updating the server

```bash
cd /home/slopcall/server
# upload the new src/ files
npm ci --omit=dev
pm2 restart slopcall
```

Only the `slopcall` process is restarted.

## Voice and NAT

The server relays WebRTC offers/answers/ICE and provides Google STUN servers. This is
enough for most home networks. If users on symmetric NAT cannot hear each other, install
coturn with `apt` and set `TURN_URL` / `TURN_USERNAME` / `TURN_PASSWORD`. The server
forwards those credentials to clients automatically.

Because voice is a full mesh, each participant sends audio directly to every other
participant. That is why rooms are capped at 12 and the practical comfortable size is
about 6 people.

## Troubleshooting

- **App shows Offline:** check `curl http://31.77.9.218:8787/health` from your PC and the
  ufw rule. Make sure the address in Settings starts with `ws://`.
- **No microphone:** Windows → Settings → Privacy → Microphone → allow desktop apps.
- **Hotkeys do nothing:** another app may own `Ctrl+Shift+M`/`D`; check the pm2/dev log
  for a "failed to register" warning.
- **Port conflict:** change `PORT`, `pm2 restart slopcall --update-env`, and update the
  client server address.
