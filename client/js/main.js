const socket = io();

const menuEl = document.getElementById('menu');
const roomEl = document.getElementById('room');
const placementEl = document.getElementById('placement');
const battleEl = document.getElementById('battle');
const menuErrorEl = document.getElementById('menuError');
const roomCodeEl = document.getElementById('roomCode');
const roomStatusEl = document.getElementById('roomStatus');

const screens = [menuEl, roomEl, placementEl, battleEl];
function showScreen(el) {
  for (const screen of screens) screen.classList.toggle('hidden', screen !== el);
}

const placementScreen = window.createPlacementScreen({
  gridEl: document.getElementById('placementGrid'),
  trayEl: document.getElementById('shipTray'),
  rotateBtn: document.getElementById('rotateBtn'),
  randomizeBtn: document.getElementById('randomizeBtn'),
  readyBtn: document.getElementById('readyBtn'),
  statusEl: document.getElementById('placementStatus'),
});

const battleScreen = window.createBattleScreen({
  ownGridEl: document.getElementById('ownGrid'),
  enemyGridEl: document.getElementById('enemyGrid'),
  turnIndicatorEl: document.getElementById('turnIndicator'),
  gameOverEl: document.getElementById('gameOverOverlay'),
  gameOverTitleEl: document.getElementById('gameOverTitle'),
  gameOverStatsEl: document.getElementById('gameOverStats'),
  playAgainBtn: document.getElementById('playAgainBtn'),
});

let selectedDifficulty = 'medium';
document.querySelectorAll('.difficulty-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedDifficulty = btn.dataset.difficulty;
    document.querySelectorAll('.difficulty-btn').forEach((b) => {
      b.classList.toggle('selected', b === btn);
    });
  });
});

document.getElementById('vsComputerBtn').addEventListener('click', () => {
  showScreen(placementEl);
  placementScreen.enter((placements) => {
    showScreen(battleEl);
    battleScreen.start({ placements, difficulty: selectedDifficulty }, () => {
      showScreen(menuEl);
    });
  });
});

document.getElementById('backToMenuBtn').addEventListener('click', () => {
  showScreen(menuEl);
});

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
  roomStatusEl.textContent = 'Opponent connected! (online sync arrives in step 4)';
});

socket.on('opponentDisconnected', () => {
  roomStatusEl.textContent = 'Opponent disconnected.';
});

function enterRoom(code, playerNumber) {
  showScreen(roomEl);
  roomCodeEl.textContent = code;
  roomStatusEl.textContent =
    playerNumber === 1
      ? 'Waiting for opponent…'
      : 'Connected as Player 2. Waiting for battle to start…';
}

function setError(msg) {
  menuErrorEl.textContent = msg;
}
