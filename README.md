# Battleship

Hypervisual online Battleship. Play vs. a client-side AI, or challenge a
friend anywhere in the world with a short room code.

## Status

Step 1 of 6: project skeleton — server + client, room create/join over
Socket.IO. No game board yet.

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:3000 in a browser tab.

## Test room create/join (two tabs)

1. Open http://localhost:3000 in **Tab A**, click **Create Room**. Note the
   room code shown (e.g. `WAVE-42`).
2. Open http://localhost:3000 in **Tab B**, enter that code, click **Join**.
3. Both tabs should update to "Opponent connected!" — confirms the server is
   brokering rooms correctly over WebSockets.
4. Close Tab B and confirm Tab A shows "Opponent disconnected."

## Project structure

```
server/       Node.js + Express + Socket.IO — authoritative game server
client/       Static HTML/CSS/JS served by the server
```
