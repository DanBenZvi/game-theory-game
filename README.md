# Battleship

Hypervisual online Battleship. Play vs. a client-side AI, or challenge a
friend anywhere in the world with a short room code.

## Status

Step 3 of 6: full turn-based battle vs. a client-side AI (Easy/Medium/Hard),
on top of step 2's animated ocean + ship placement and step 1's room
create/join. Online play (syncing two real players) is step 4.

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:3000 in a browser tab. If that port is already
in use on your machine, run `PORT=3010 npm run dev` instead and use
http://localhost:3010.

## Test a full game vs. the AI

1. Open the app, click **Play vs Computer**.
2. Place your fleet (drag ships or click **Randomize**), pick a
   difficulty (**Easy** / **Medium** / **Hard**) in the tray panel, then
   click **Ready**.
3. You land on the battle screen: **Your Fleet** (left, ships visible)
   and **Enemy Waters** (right, fog of war). "Your turn — fire!" shows
   at the top.
4. Click any cell on **Enemy Waters** to fire. It should light up red
   (hit) or show a small dot (miss). The turn indicator switches to
   "Enemy turn…" and, after a short pause, the AI fires back — watch a
   cell light up on **Your Fleet**.
5. Sinking every cell of one ship should turn that ship's cells a
   darker "sunk" color on the board that owns it.
6. Play to the end — a **VICTORY** or **DEFEAT** overlay appears with a
   shot count, and **Back to Menu** returns you to the main menu.
7. Try a difficulty comparison: **Hard** should feel noticeably sharper
   once it lands a hit (it hunts adjacent cells immediately) than
   **Easy** (which fires blindly at random even after a hit).

## Test the ship placement screen — from step 2, still works

Same as before: drag-and-drop with snap preview, **R**/**Rotate** to
flip a ship, **Randomize**, **Back to Menu** always returns to a clean
menu and re-entering starts from an empty board.

## Test room create/join (two tabs) — from step 1, still works

1. Open the app in **Tab A**, click **Create Room**. Note the room code
   shown (e.g. `WAVE-42`).
2. Open the app in **Tab B**, enter that code, click **Join**.
3. Both tabs should update to "Opponent connected!"
4. Close Tab B and confirm Tab A shows "Opponent disconnected."

## Project structure

```
server/       Node.js + Express + Socket.IO — authoritative game server
client/       Static HTML/CSS/JS served by the server
  js/ocean.js       WebGL shader animated ocean background
  js/placement.js   Ship placement screen (grid + drag/drop tray)
  js/ai.js          Client-side AI opponent (easy/medium/hard)
  js/battle.js       Turn-based battle screen (two boards, firing, win/lose)
  js/main.js        Menu/room/screen wiring, Socket.IO client
shared/       Pure game logic (board/placement/firing rules) usable by
              both the browser and the server — server-side validation
              in step 4 will reuse the exact same fireAt()/createBattleState()
              instead of trusting the client.
```
