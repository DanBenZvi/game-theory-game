// In-memory room registry. Rooms are keyed by short human-readable codes
// like "WAVE-42". No persistence — fine for a single-process game server.

const CODE_WORDS = [
  'WAVE', 'REEF', 'TIDE', 'CORAL', 'STORM', 'DEEP', 'SALT', 'FLEET',
  'ANCHOR', 'SONAR', 'MIST', 'SHOAL', 'CREST', 'SWELL', 'HULL',
];

const EMPTY_ROOM_GRACE_MS = 30_000;

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

function createRoom(socketId) {
  const code = generateUniqueCode();
  const room = {
    code,
    players: [{ socketId, playerNumber: 1, connected: true }],
    status: 'waiting', // waiting -> placing -> battle -> finished
    createdAt: Date.now(),
    emptyTimer: null,
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return room;
}

function joinRoom(code, socketId) {
  const room = rooms.get(code);
  if (!room) {
    return { ok: false, error: 'Room not found.' };
  }
  if (room.players.length >= 2) {
    return { ok: false, error: 'Room is full.' };
  }
  clearEmptyTimer(room);
  room.players.push({ socketId, playerNumber: 2, connected: true });
  socketToRoom.set(socketId, code);
  return { ok: true, code, playerNumber: 2 };
}

function getRoom(code) {
  return rooms.get(code);
}

function getRoomForSocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : undefined;
}

function clearEmptyTimer(room) {
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
}

function handleDisconnect(socketId, io) {
  const code = socketToRoom.get(socketId);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  socketToRoom.delete(socketId);
  const player = room.players.find((p) => p.socketId === socketId);
  if (player) player.connected = false;

  io.to(code).emit('opponentDisconnected', { code });

  const anyoneConnected = room.players.some((p) => p.connected);
  if (!anyoneConnected) {
    clearEmptyTimer(room);
    room.emptyTimer = setTimeout(() => {
      rooms.delete(code);
    }, EMPTY_ROOM_GRACE_MS);
  }
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  getRoomForSocket,
  handleDisconnect,
};
