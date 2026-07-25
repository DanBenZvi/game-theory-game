# Battleship

Hypervisual online Battleship. Play vs. a client-side AI, or challenge a
friend anywhere in the world with a short room code.

## Status

Step 6 of 6 — feature-complete. Final polish on top of step 5's visual/
audio pass: post-game stats (shots, hits, accuracy, ships sunk) on every
win/lose screen, a victory fireworks/confetti burst, a rematch button for
vs-AI, screen-entrance transitions, a copy-to-clipboard room code, and a
responsive layout fix for narrow screens. See [DEPLOY.md](DEPLOY.md) for
hosting notes (Railway/Render/Fly.io).

Since then: fixed a real bug where the hit-flash/miss-ripple effects were
rendering across the *entire board* instead of the single cell they hit
(missing `position: relative` on `.cell`), smoothed the screen-shake
animation, and added optional background battle music — see
[client/audio/README.md](client/audio/README.md) to enable it.

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:3000 in a browser tab. If that port is already
in use on your machine, run `PORT=3010 npm run dev` instead and use
http://localhost:3010.

## Test the latest fixes

1. Fire at an enemy cell and watch the impact — the flash (hit) or
   ripple (miss) should stay contained inside that one cell, not flare
   across the whole board. The screen-shake on a hit should read as a
   quick, smooth decaying wobble, not a jerky diagonal jolt.
2. To enable background music: add your own licensed audio file at
   `client/audio/battle-theme.mp3` (see [client/audio/README.md](client/audio/README.md)
   for why this project can't ship one). Start a battle — it should fade
   in and loop, fade out when you return to the menu, and mute/unmute
   with the existing speaker button. Without a file there, the game
   plays exactly as before (silently skipped, one console note).

## Test the final polish pass

1. Play a full vs-AI game to the end. The win/lose overlay should show a
   stats line — shots fired, hits, accuracy %, and ships sunk out of 5 —
   and on a win, a multi-burst firework/confetti animation plays.
2. On a win, click **Play Again** — it should instantly start a fresh
   battle reusing the *same* fleet placement against a newly-shuffled
   enemy, no trip back through the menu. **Back to Menu** still works too.
3. On the room-code screen, click the **⧉ Copy** button next to the code
   — it should copy to your clipboard and briefly show "✓ Copied!".
4. Notice screens fade/slide in as you navigate (menu → placement →
   battle) instead of snapping instantly.
5. Resize the browser down to a phone-width window (or open dev tools'
   device toolbar) — the layout should reflow to a single column with no
   horizontal scrollbar, on the menu, placement, and battle screens alike.

## Test the visual/audio polish

Sound needs one click anywhere on the page first (browsers block audio
until a user gesture) — click any button and it unlocks automatically.

1. Start any battle (vs Computer is fastest) and fire at an enemy cell.
   You should see a glowing missile arc from your board to the target,
   hear a launch "fire" sound, then on arrival either:
   - **Hit**: a bright flash, a burst of orange/red particles, the whole
     battle panel shakes briefly, and an explosion sound.
   - **Miss**: an expanding ripple ring + a few blue droplet particles,
     plus a splash sound.
2. Watch for the AI/opponent firing back — same missile arc, but coming
   from the enemy board toward yours.
3. Sink a ship (hit every one of its cells) — its cells should sink in
   a staggered sequence (each cell darkens/dips a beat after the last)
   with bubbles rising from each one, plus a deeper "sunk" sound.
4. Win or lose a game — a victory fanfare or a somber defeat tone plays
   alongside the VICTORY/DEFEAT overlay.
5. Click the speaker icon (top-right, on every screen) to mute — all
   effects and the background ocean hum should go silent immediately;
   click again to unmute.
6. While a shot is resolving (missile in flight / impact playing),
   clicking another enemy cell should do nothing — turns are locked
   until the animation finishes, so you can't queue up extra shots.

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
  js/effects.js      Missile arcs, particle bursts, screen shake, sinking
                     animation — shared by both battle screens
  js/sound.js        WebAudio-generated sound engine (no audio files)
  js/music.js        Optional looping background battle music — plays a
                     user-supplied file (client/audio/battle-theme.mp3);
                     fails silently and harmlessly if it's not there
  js/battle.js       vs-AI battle screen (two boards, firing, win/lose)
  js/onlineBattle.js Online battle screen — same rendering, but every
                     shot is server-confirmed instead of computed locally
  js/main.js         Screen wiring, Socket.IO client, session persistence
                     (sessionStorage room token) for reconnect-on-reload,
                     sound unlock/mute
  audio/README.md    Where to put your own licensed battle-theme.mp3
shared/       Pure game logic (board/placement/firing rules) usable by
              both the browser and the server, so online mode can't be
              cheated by inspecting/editing the page — the server always
              recomputes hit/miss/sunk itself via the same fireAt().
DEPLOY.md     Hosting notes (Railway/Render/Fly.io) and the state-model
              caveat (single instance only — game state is in memory).
```

## Deploying

See [DEPLOY.md](DEPLOY.md).
