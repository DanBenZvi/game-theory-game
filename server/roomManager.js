// In-memory room registry + authoritative game state machine. Rooms are
// keyed by short human-readable codes like "WAVE-42". No persistence —
// fine for a single-process game server.
//
// This module is deliberately I/O-free (no socket.io references) so it
// can be unit-tested directly: every function is a pure state mutation
// that returns enough information for the caller (server/index.js) to
// decide what to broadcast and when to schedule/cancel timers.

const crypto = require('node:crypto');
const L = require('../shared/battleshipLogic');

const CODE_WORDS = [
  'WAVE', 'REEF', 'TIDE', 'CORAL', 'STORM', 'DEEP', 'SALT', 'FLEET',
  'ANCHOR', 'SONAR', 'MIST', 'SHOAL', 'CREST', 'SWELL', 'HULL',
];

const EMPTY_ROOM_GRACE_MS = 30_000;
const PLAYER_RECONNECT_GRACE_MS = 45_000;

/** @type {Map<string, Room>} */
const rooms = new Map();

/** @type {Map<string, string>} socket.id -> room code, for fast disconnect lookup */
const socketToRoom = new Map();

function randomCode() {
  const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${word}-${num}`;
}

function generateUniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (rooms.has(code));
  return code;
}

function makeToken() {
  return crypto.randomUUID();
}

function createRoom(socketId) {
  const code = generateUniqueCode();
  const player = {
    socketId,
    playerNumber: 1,
    token: makeToken(),
    connected: true,
    placements: null,
    ready: false,
    disconnectTimer: null,
  };
  const room = {
    code,
    players: [player],
    status: 'waiting', // waiting -> placing -> battle -> finished
    battle: null, // { boards: { 1: battleState, 2: battleState }, turn: 1|2|null }
    winner: null,
    createdAt: Date.now(),
    emptyTimer: null,
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return { room, player };
}

function joinRoom(code, socketId) {
  const room = rooms.get(code);
  if (!room) {
    return { ok: false, error: 'Room not found.' };
  }
  if (room.players.length >= 2) {
    return { ok: false, error: 'Room is full.' };
  }
  clearRoomTimer(room);
  const player = {
    socketId,
    playerNumber: 2,
    token: makeToken(),
    connected: true,
    placements: null,
    ready: false,
    disconnectTimer: null,
  };
  room.players.push(player);
  room.status = 'placing';
  socketToRoom.set(socketId, code);
  return { ok: true, room, player };
}

function getRoom(code) {
  return rooms.get(code);
}

function getRoomForSocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : undefined;
}

function getPlayer(room, socketId) {
  return room.players.find((p) => p.socketId === socketId);
}

function getOpponent(room, player) {
  return room.players.find((p) => p.playerNumber !== player.playerNumber);
}

/** Validates and stores one player's fleet; starts the battle once both are ready. */
function submitPlacement(room, socketId, placements) {
  const player = getPlayer(room, socketId);
  if (!player) return { ok: false, error: 'Not in this room.' };
  if (room.status !== 'placing') return { ok: false, error: 'Placement is not open right now.' };
  if (!L.validateFullPlacement(placements)) {
    return { ok: false, error: 'Invalid fleet placement.' };
  }

  player.placements = placements;
  player.ready = true;

  const opponent = getOpponent(room, player);
  const bothReady = Boolean(opponent && opponent.ready);
  if (bothReady) {
    room.battle = {
      boards: {
        1: L.createBattleState(room.players[0].placements),
        2: L.createBattleState(room.players[1].placements),
      },
      turn: 1,
    };
    room.status = 'battle';
  }

  return { ok: true, battleStarted: bothReady, turn: bothReady ? 1 : null };
}

/** Fires at the opponent's board on behalf of `socketId`. Server-authoritative. */
function fireShot(room, socketId, row, col) {
  const player = getPlayer(room, socketId);
  if (!player) return { ok: false, error: 'Not in this room.' };
  if (room.status !== 'battle') return { ok: false, error: 'Battle has not started.' };
  if (room.battle.turn !== player.playerNumber) return { ok: false, error: 'Not your turn.' };

  const opponent = getOpponent(room, player);
  const targetState = room.battle.boards[opponent.playerNumber];
  const result = L.fireAt(targetState, row, col);

  if (result.status === 'already-fired' || result.status === 'invalid') {
    return { ok: false, error: 'Invalid shot.' };
  }

  if (result.allSunk) {
    room.status = 'finished';
    room.battle.turn = null;
    room.winner = player.playerNumber;
  } else {
    room.battle.turn = opponent.playerNumber;
  }

  const shipCells =
    result.status === 'sunk'
      ? targetState.placements.find((p) => p.id === result.shipId).cells
      : undefined;

  return {
    ok: true,
    result,
    shipCells,
    by: player.playerNumber,
    nextTurn: room.battle.turn,
    gameOver: Boolean(result.allSunk),
    winner: room.winner,
  };
}

/** Everything a client needs to fully rebuild its UI after a reload/reconnect. */
function buildSnapshot(room, player) {
  const opponent = getOpponent(room, player);
  const battle = room.battle;
  return {
    status: room.status,
    playerNumber: player.playerNumber,
    myPlacements: player.placements,
    ready: player.ready,
    opponentReady: Boolean(opponent && opponent.ready),
    opponentConnected: Boolean(opponent && opponent.connected),
    turn: battle ? battle.turn : null,
    myShotsOnOpponent:
      battle && opponent ? L.getShotHistory(battle.boards[opponent.playerNumber]) : [],
    opponentShotsOnMe: battle ? L.getShotHistory(battle.boards[player.playerNumber]) : [],
    winner: room.winner,
  };
}

/** Pure state mutation: marks the owning player disconnected. No timers, no I/O. */
function disconnectSocket(socketId) {
  const room = getRoomForSocket(socketId);
  if (!room) return null;
  socketToRoom.delete(socketId);
  const player = getPlayer(room, socketId);
  if (!player) return null;
  player.connected = false;
  const opponent = getOpponent(room, player);
  return { room, player, opponent };
}

function scheduleForfeit(room, player, ms, onExpire) {
  clearPlayerTimer(player);
  player.disconnectTimer = setTimeout(() => {
    player.disconnectTimer = null;
    if (!player.connected) onExpire();
  }, ms);
}

function scheduleRoomDeletion(room, ms, onExpire) {
  clearRoomTimer(room);
  room.emptyTimer = setTimeout(() => {
    room.emptyTimer = null;
    const stillEmpty = room.players.every((p) => !p.connected);
    if (stillEmpty) onExpire();
  }, ms);
}

function clearPlayerTimer(player) {
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

function clearRoomTimer(room) {
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
}

/** Re-attaches a returning player's new socket to their existing seat. */
function rejoin(code, token, newSocketId) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: 'Room no longer available.' };
  const player = room.players.find((p) => p.token === token);
  if (!player) return { ok: false, error: 'Session not recognized.' };

  clearPlayerTimer(player);
  clearRoomTimer(room);
  player.socketId = newSocketId;
  player.connected = true;
  socketToRoom.set(newSocketId, code);

  return { ok: true, room, player };
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  for (const player of room.players) clearPlayerTimer(player);
  clearRoomTimer(room);
  rooms.delete(code);
}

module.exports = {
  EMPTY_ROOM_GRACE_MS,
  PLAYER_RECONNECT_GRACE_MS,
  createRoom,
  joinRoom,
  getRoom,
  getRoomForSocket,
  getPlayer,
  getOpponent,
  submitPlacement,
  fireShot,
  buildSnapshot,
  disconnectSocket,
  scheduleForfeit,
  scheduleRoomDeletion,
  rejoin,
  deleteRoom,
};
