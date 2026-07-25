# Deploying Battleship

The server is a plain Node.js + Express + Socket.IO app — one process,
no database, no build step. It serves the client's static files itself,
so a single deployed service is everything you need.

## Before you deploy: understand the state model

**Game state lives entirely in server memory** (`server/roomManager.js`).
That means:

- **Don't run more than one instance/replica.** If a platform load-balances
  across multiple instances, two players in the same room could land on
  different instances and never see each other. This app is sized for a
  single always-on instance (fine for personal use or a demo with friends).
- **Rooms don't survive a restart or redeploy.** Anyone mid-game loses
  their room when the process restarts. There's nothing to migrate —
  just be aware a deploy will interrupt live games.
- Horizontal scaling would require moving room state to a shared store
  (e.g. Redis, with the `@socket.io/redis-adapter` for broadcasting
  across instances) — not implemented here, out of scope for this project.

## Environment variables

| Variable               | Default | Purpose                                                             |
| ----------------------- | ------- | -------------------------------------------------------------------- |
| `PORT`                  | `3000`  | Port the server listens on. Most platforms set this for you.        |
| `RECONNECT_GRACE_MS`    | `45000` | How long a disconnected player's seat is held before forfeit.       |
| `EMPTY_ROOM_GRACE_MS`   | `30000` | How long a room with nobody connected is kept before being deleted. |

None are required — the defaults are sensible for real play.

## Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, pick this repo.
3. Railway auto-detects Node.js, runs `npm install`, and starts it with
   `npm start`. It sets `PORT` automatically — no config needed.
4. Once deployed, open the generated `*.up.railway.app` URL.

## Render

1. Push this repo to GitHub.
2. In Render: **New → Web Service**, connect the repo.
3. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: the free/starter tier is fine (just one instance —
     do not enable autoscaling, per the state-model note above).
4. Render sets `PORT` automatically. Deploy and open the given URL.

## Fly.io

1. Install `flyctl` and run `fly launch` in the project root — it will
   detect Node.js and generate a `fly.toml`.
2. Make sure `fly.toml` has exactly **one** instance:
   ```toml
   [http_service]
     internal_port = 8080
     min_machines_running = 1

   [[vm]]
     count = 1
   ```
   Set `PORT=8080` (or whatever `internal_port` you chose) as a secret/env
   var, or update `internal_port` to `3000` to match the app's default.
3. `fly deploy`.

## Testing a deploy

1. Open the deployed URL in two separate browsers (or a normal + private
   window) and confirm **Create Room** → **Join Room** works across them.
2. Confirm WebSocket upgrade is working — if room create/join hangs, the
   platform may be proxying without WebSocket support enabled (rare on
   the three platforms above, but worth checking their docs if it happens).
3. Share the URL with a friend on a different network to confirm it works
   over the public internet, not just your local network.
