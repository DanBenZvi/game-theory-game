const socket = io();

const menuEl = document.getElementById('menu');
const roomEl = document.getElementById('room');
const menuErrorEl = document.getElementById('menuError');
const roomCodeEl = document.getElementById('roomCode');
const roomStatusEl = document.getElementById('roomStatus');

document.getElementById('createBtn').addEventListener('click', () => {
  setError('');
  socket.emit('createRoom', (res) => {
    if (!res.ok) {
      setError(res.error || 'Could not create room.');
      return;
    }
    enterRoom(res.code, res.playerNumber);
  });
});

document.getElementById('joinBtn').addEventListener('click', () => {
  const code = document.getElementById('joinInput').value.trim();
  if (!code) {
    setError('Enter a room code.');
    return;
  }
  setError('');
  socket.emit('joinRoom', code, (res) => {
    if (!res.ok) {
      setError(res.error || 'Could not join room.');
      return;
    }
    enterRoom(res.code, res.playerNumber);
  });
});

socket.on('opponentJoined', () => {
  roomStatusEl.textContent = 'Opponent connected! (placement coming in step 2)';
});

socket.on('opponentDisconnected', () => {
  roomStatusEl.textContent = 'Opponent disconnected.';
});

function enterRoom(code, playerNumber) {
  menuEl.classList.add('hidden');
  roomEl.classList.remove('hidden');
  roomCodeEl.textContent = code;
  roomStatusEl.textContent =
    playerNumber === 1
      ? 'Waiting for opponent…'
      : 'Connected as Player 2. Waiting for battle to start…';
}

function setError(msg) {
  menuErrorEl.textContent = msg;
}
