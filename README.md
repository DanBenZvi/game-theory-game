# Battleship

Hypervisual online Battleship. Play vs. a client-side AI, or challenge a
friend anywhere in the world with a short room code.

## Status

Step 4 of 6: real online play between two independent browsers/computers
— server-authoritative placement + turn sync, live opponent-connected
banners, and disconnect/reconnect handling with a grace period — on top
of step 3's vs-AI battle, step 2's ship placement, and step 1's rooms.

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:3000 in a browser tab. If that port is already
in use on your machine, run `PORT=3010 npm run dev` instead and use
http://localhost:3010.

## Test online play (two tabs, or two computers on the same network)

1. In **Tab/Computer A**, click **Create Room**. Note the room code
   (e.g. `WAVE-42`).
2. In **Tab/Computer B** (for two computers, use A's local network IP
   instead of `localhost`, e.g. `http://192.168.1.23:3000`), enter that
   code and click **Join**.
3. Both should automatically advance to the placement screen the moment
   the second player joins — no "Ready to start?" step needed.
4. Both place a fleet (drag or **Randomize**) and click **Ready**. The
   first to click sees "Waiting for opponent…"; both advance to the
   battle screen together the instant both are ready.
5. Player 1 (the room creator) goes first. Fire on **Enemy Waters** —
   the hit/miss should appear on *both* screens (your enemy view and
   their own-fleet view), and the turn indicator should swap sides.
6. Play it out — sinking a ship reveals its full outline to the
   attacker; the loser's screen and winner's screen both show the
   correct VICTORY/DEFEAT overlay.
7. **Disconnect test**: mid-game, reload one tab. The other tab should
   show an "Opponent disconnected…" banner; once the reloaded tab comes
   back, it should land right back on the battle screen with your fleet,
   every shot fired so far, and whose turn it is all intact — and the
   other tab's banner should switch to "Opponent reconnected!".
8. **Forfeit test**: mid-game, close one tab entirely (don't reload) and
   wait about 45 seconds. The remaining tab should get a VICTORY screen
   noting the opponent left.

## Test a full game vs. the AI — from step 3, still works

Same as before: **Play vs Computer**, place your fleet, pick a
difficulty, fire until VICTORY/DEFEAT.

## Test the ship placement screen — from step 2, still works

Drag-and-drop with snap preview, **R**/**Rotate** to flip a ship,
**Randomize**, **Back to Menu** always returns to a clean menu.

## Project structure

```
server/
  index.js          Express + Socket.IO wiring — translates socket
                     events into roomManager calls and broadcasts
  roomManager.js     Authoritative room/game state machine (pure, no
                     socket.io references — unit-testable on its own):
                     room codes, placement validation, turn-by-turn
                     firing, disconnect grace timers, reconnect tokens
client/       Static HTML/CSS/JS served by the server
  js/ocean.js        WebGL shader animated ocean background
  js/placement.js    Ship placement screen (grid + drag/drop tray)
  js/ai.js           Client-side AI opponent (easy/medium/hard)
  js/battle.js       vs-AI battle screen (two boards, firing, win/lose)
  js/onlineBattle.js Online battle screen — same rendering, but every
                     shot is server-confirmed instead of computed locally
  js/main.js         Screen wiring, Socket.IO client, session persistence
                     (sessionStorage room token) for reconnect-on-reload
shared/       Pure game logic (board/placement/firing rules) usable by
              both the browser and the server, so online mode can't be
              cheated by inspecting/editing the page — the server always
              recomputes hit/miss/sunk itself via the same fireAt().
```
