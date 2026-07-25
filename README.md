# Battleship

Hypervisual online Battleship. Play vs. a client-side AI, or challenge a
friend anywhere in the world with a short room code.

## Status

Step 2 of 6: animated WebGL ocean background, neon 10x10 grid, and full
ship-placement UX (drag-and-drop with snap, rotate, randomize). Room
create/join works (step 1). No battle logic yet — that's step 3.

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:3000 in a browser tab. If that port is already
in use on your machine, run `PORT=3010 npm run dev` instead and use
http://localhost:3010.

## Test the ship placement screen

1. Open the app, click **Play vs Computer**.
2. You should see an animated dark-water background behind a glowing
   10x10 grid, with a "Deploy Your Fleet" tray of 5 ships (lengths 5, 4,
   3, 3, 2) on the right.
3. Drag a ship from the tray onto the grid — cells should light up cyan
   (valid) or orange (overlapping/out of bounds) as you drag, and the
   ship should snap into place on drop.
4. Grab a ship again (from the tray or the board) and press **R**, or
   click **Rotate**, to flip it between horizontal/vertical.
5. Click **Randomize** — all 5 ships should place themselves validly and
   the **Ready** button should light up.
6. Click **Ready** — placement locks (battle logic arrives in step 3).
7. **Back to Menu** should return cleanly, and re-entering **Play vs
   Computer** should start from an empty board each time.

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
  js/main.js        Menu/room/screen wiring, Socket.IO client
shared/       Pure game logic (board/ship placement) usable by both the
              browser and the server — server-side validation reuses
              this in step 4 instead of trusting the client.
```
