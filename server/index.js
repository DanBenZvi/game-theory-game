const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const RM = require('./roomManager');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

const server = http.createServer(app);
const io = new Server(server);

// Overridable for fast integration tests; production uses roomManager's
// defaults (45s to reconnect after a drop, 30s to reap a fully-empty room,
// 15s to auto-pass a stalled turn).
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || RM.PLAYER_RECONNECT_GRACE_MS;
const EMPTY_ROOM_GRACE_MS = Number(process.env.EMPTY_ROOM_GRACE_MS) || RM.EMPTY_ROOM_GRACE_MS;
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS) || RM.TURN_TIMEOUT_MS;

/** (Re)arms the current player's turn clock; on expiry, passes the turn and re-arms for the next player. */
function armTurnTimeout(room) {
  RM.scheduleTurnTimeout(room, TURN_TIMEOUT_MS, () => {
    const result = RM.passTurnOnTimeout(room);
    if (!result) return; // game ended or room gone between scheduling and firing
    io.to(room.code).emit('turnTimeout', result);
    armTurnTimeout(room);
  });
}

io.on('connection', (socket) => {
  socket.on('createRoom', (ack) => {
    const { room, player } = RM.createRoom(socket.id);
    socket.join(room.code);
    ack({ ok: true, code: room.code, playerNumber: player.playerNumber, token: player.token });
  });

  socket.on('joinRoom', (code, ack) => {
    const normalized = String(code || '').trim().toUpperCase();
    const result = RM.joinRoom(normalized, socket.id);
    if (!result.ok) {
      ack(result);
      return;
    }
    socket.join(result.room.code);
    ack({
      ok: true,
      code: result.room.code,
      playerNumber: result.player.playerNumber,
      token: result.player.token,
    });
    io.to(result.room.code).emit('opponentJoined', { code: result.room.code });
  });

  socket.on('rejoinRoom', ({ code, token } = {}, ack) => {
    const result = RM.rejoin(String(code || '').trim().toUpperCase(), token, socket.id);
    if (!result.ok) {
      ack(result);
      return;
    }
    socket.join(result.room.code);
    const opponent = RM.getOpponent(result.room, result.player);
    if (opponent) {
      io.to(result.room.code).emit('opponentReconnected', {
        playerNumber: result.player.playerNumber,
      });
    }
    ack({ ok: true, snapshot: RM.buildSnapshot(result.room, result.player) });
  });

  socket.on('submitPlacement', ({ code, placements } = {}, ack) => {
    const room = RM.getRoom(code);
    if (!room) {
      ack({ ok: false, error: 'Room not found.' });
      return;
    }
    const player = RM.getPlayer(room, socket.id);
    const result = RM.submitPlacement(room, socket.id, placements);
    ack(result);
    if (!result.ok) return;

    if (result.battleStarted) {
      io.to(room.code).emit('battleStart', { turn: result.turn, score: room.score });
      armTurnTimeout(room);
    } else if (player) {
      io.to(room.code).emit('placementStatus', { readyPlayerNumber: player.playerNumber });
    }
  });

  socket.on('fire', ({ code, row, col } = {}, ack) => {
    const room = RM.getRoom(code);
    if (!room) {
      ack({ ok: false, error: 'Room not found.' });
      return;
    }
    const result = RM.fireShot(room, socket.id, row, col);
    ack(result.ok ? { ok: true } : result);
    if (!result.ok) return;

    io.to(room.code).emit('shotResult', {
      by: result.by,
      row: result.result.row,
      col: result.result.col,
      status: result.result.status,
      shipCells: result.shipCells,
      turn: result.nextTurn,
      gameOver: result.gameOver,
      winner: result.winner,
      score: result.score,
    });

    if (!result.gameOver) armTurnTimeout(room);
  });

  socket.on('leaveRoom', ({ code } = {}, ack) => {
    const room = RM.getRoom(code);
    if (!room) {
      if (ack) ack({ ok: true });
      return;
    }
    const result = RM.leaveRoom(room, socket.id);
    if (ack) ack({ ok: result.ok, error: result.error });
    if (result.ok && result.opponent) {
      io.to(room.code).emit('opponentLeft', {
        playerNumber: result.leavingPlayerNumber,
        score: result.score,
      });
    }
    RM.deleteRoom(room.code);
  });

  socket.on('requestRematch', ({ code } = {}, ack) => {
    const room = RM.getRoom(code);
    if (!room) {
      ack({ ok: false, error: 'Room not found.' });
      return;
    }
    const player = RM.getPlayer(room, socket.id);
    const result = RM.requestRematch(room, socket.id);
    ack(result);
    if (!result.ok) return;

    if (result.bothReady) {
      io.to(room.code).emit('rematchStart', { score: result.score });
    } else if (player) {
      io.to(room.code).emit('rematchRequested', { playerNumber: player.playerNumber });
    }
  });

  socket.on('disconnect', () => {
    const disc = RM.disconnectSocket(socket.id);
    if (!disc) return;
    const { room, player, opponent } = disc;

    if (opponent && opponent.connected) {
      io.to(room.code).emit('opponentDisconnected', { playerNumber: player.playerNumber });
      RM.scheduleForfeit(room, player, RECONNECT_GRACE_MS, () => {
        const result = RM.forfeitWin(room, player);
        io.to(room.code).emit('opponentLeft', { playerNumber: player.playerNumber, score: result.score });
        RM.deleteRoom(room.code);
      });
    } else {
      RM.scheduleRoomDeletion(room, EMPTY_ROOM_GRACE_MS, () => {
        RM.deleteRoom(room.code);
      });
    }
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Battleship server listening on port ${PORT}`);
});
