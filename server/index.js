const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const {
  createRoom,
  joinRoom,
  getRoom,
  getRoomForSocket,
  handleDisconnect,
} = require('./roomManager');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
  socket.on('createRoom', (ack) => {
    const room = createRoom(socket.id);
    socket.join(room.code);
    ack({ ok: true, code: room.code, playerNumber: 1 });
  });

  socket.on('joinRoom', (code, ack) => {
    const normalized = String(code || '').trim().toUpperCase();
    const result = joinRoom(normalized, socket.id);
    if (!result.ok) {
      ack(result);
      return;
    }
    socket.join(result.code);
    ack(result);
    io.to(result.code).emit('opponentJoined', { code: result.code });
  });

  socket.on('disconnect', () => {
    const room = getRoomForSocket(socket.id);
    handleDisconnect(socket.id, io);
    if (room) {
      io.to(room.code).emit('roomState', describeRoom(room));
    }
  });
});

function describeRoom(room) {
  return {
    code: room.code,
    status: room.status,
    playerCount: room.players.filter((p) => p.connected).length,
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Battleship server listening on http://localhost:${PORT}`);
});
