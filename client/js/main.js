const socket = io();

const STORAGE_KEY = 'battleship:activeRoom';

const menuEl = document.getElementById('menu');
const roomEl = document.getElementById('room');
const placementEl = document.getElementById('placement');
const battleEl = document.getElementById('battle');
const menuErrorEl = document.getElementById('menuError');
const roomCodeEl = document.getElementById('roomCode');
const roomStatusEl = document.getElementById('roomStatus');
const bannerEl = document.getElementById('onlineBanner');
const difficultyPickerEl = document.getElementById('difficultyPicker');
const placementStatusEl = document.getElementById('placementStatus');

const screens = [menuEl, roomEl, placementEl, battleEl];
const battleBackBtn = document.getElementById('battleBackBtn');
function showScreen(el) {
  for (const screen of screens) screen.classList.toggle('hidden', screen !== el);
  el.classList.remove('screen-enter');
  void el.offsetWidth; // restart the entrance animation even if re-entering the same screen
  el.classList.add('screen-enter');
  battleBackBtn.classList.toggle('hidden', el !== battleEl);
}

function setRoomStatus(text) {
  roomStatusEl.textContent = text;
  roomStatusEl.classList.toggle('pulsing', /waiting/i.test(text));
}

function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.classList.remove('hidden');
}
function hideBanner() {
  bannerEl.classList.add('hidden');
}

// ---------- Sound: unlock on first interaction (browser autoplay policy) ----------

const muteBtn = document.getElementById('muteBtn');
let soundUnlocked = false;
function unlockSoundOnce() {
  if (soundUnlocked) return;
  soundUnlocked = true;
  SoundEngine.unlock();
  SoundEngine.startAmbience();
}
document.addEventListener('pointerdown', unlockSoundOnce, { once: true });

muteBtn.addEventListener('click', () => {
  unlockSoundOnce();
  const nowMuted = !SoundEngine.isMuted();
  SoundEngine.setMuted(nowMuted);
  muteBtn.textContent = nowMuted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', nowMuted);
});

function saveActiveRoom(code, token, playerNumber) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ code, token, playerNumber }));
}
function loadActiveRoom() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function clearActiveRoom() {
  sessionStorage.removeItem(STORAGE_KEY);
}

const placementScreen = window.createPlacementScreen({
  gridEl: document.getElementById('placementGrid'),
  trayEl: document.getElementById('shipTray'),
  rotateBtn: document.getElementById('rotateBtn'),
  randomizeBtn: document.getElementById('randomizeBtn'),
  readyBtn: document.getElementById('readyBtn'),
  statusEl: placementStatusEl,
});

const rematchBtn = document.getElementById('rematchBtn');
const onlineRematchBtn = document.getElementById('onlineRematchBtn');
const scoreboardEl = document.getElementById('scoreboard');
const rematchStatusEl = document.getElementById('rematchStatus');

const battleScreen = window.createBattleScreen({
  ownGridEl: document.getElementById('ownGrid'),
  enemyGridEl: document.getElementById('enemyGrid'),
  turnIndicatorEl: document.getElementById('turnIndicator'),
  gameOverEl: document.getElementById('gameOverOverlay'),
  gameOverTitleEl: document.getElementById('gameOverTitle'),
  gameOverStatsEl: document.getElementById('gameOverStats'),
  playAgainBtn: document.getElementById('playAgainBtn'),
  rematchBtn,
  onRematchRequested: (difficulty) => {
    selectDifficulty(difficulty);
    startVsComputerFlow();
  },
});

const onlineBattleScreen = window.createOnlineBattleScreen(
  {
    ownGridEl: document.getElementById('ownGrid'),
    enemyGridEl: document.getElementById('enemyGrid'),
    turnIndicatorEl: document.getElementById('turnIndicator'),
    scoreboardEl,
    gameOverEl: document.getElementById('gameOverOverlay'),
    gameOverTitleEl: document.getElementById('gameOverTitle'),
    gameOverStatsEl: document.getElementById('gameOverStats'),
    rematchStatusEl,
    playAgainBtn: document.getElementById('playAgainBtn'),
    onlineRematchBtn,
  },
  socket,
);

let mode = null; // 'ai' | 'online'
let roomCode = null;
let myPlayerNumber = null;
let myToken = null;
let myPlacements = null;

let selectedDifficulty = 'medium';
function selectDifficulty(difficulty) {
  selectedDifficulty = difficulty;
  document.querySelectorAll('.difficulty-btn').forEach((b) => {
    b.classList.toggle('selected', b.dataset.difficulty === difficulty);
  });
}
document.querySelectorAll('.difficulty-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectDifficulty(btn.dataset.difficulty));
});

function resetOnlineSession() {
  mode = null;
  roomCode = null;
  myPlayerNumber = null;
  myToken = null;
  myPlacements = null;
  clearActiveRoom();
  hideBanner();
}

function goToMenu() {
  resetOnlineSession();
  showScreen(menuEl);
}

// ---------- vs Computer ----------

function startVsComputerFlow() {
  resetOnlineSession();
  mode = 'ai';
  difficultyPickerEl.style.display = '';
  showScreen(placementEl);
  placementScreen.enter((placements) => {
    showScreen(battleEl);
    rematchBtn.classList.remove('hidden');
    onlineRematchBtn.classList.add('hidden');
    scoreboardEl.classList.add('hidden');
    battleScreen.start({ placements, difficulty: selectedDifficulty }, goToMenu);
  });
}

document.getElementById('vsComputerBtn').addEventListener('click', startVsComputerFlow);

document.getElementById('backToMenuBtn').addEventListener('click', goToMenu);
document.getElementById('roomBackBtn').addEventListener('click', goToMenu);

// In-battle "Back to Menu" — visible throughout the battle screen, not just
// after it ends. For online play this abandons the match (opponent wins by
// forfeit if one was in progress), so confirm first; vs-AI has no one else
// to affect, so it just leaves.
battleBackBtn.addEventListener('click', () => {
  if (mode === 'online') {
    const confirmed = confirm(
      "Leave and return to the menu? If a match is in progress, your opponent will win by forfeit.",
    );
    if (!confirmed) return;
    onlineBattleScreen.leaveMidGame();
  } else if (mode === 'ai') {
    battleScreen.leaveMidGame();
  }
  goToMenu();
});

const copyCodeBtn = document.getElementById('copyCodeBtn');
copyCodeBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCodeEl.textContent);
    const original = copyCodeBtn.textContent;
    copyCodeBtn.textContent = '✓ Copied!';
    setTimeout(() => {
      copyCodeBtn.textContent = original;
    }, 1500);
  } catch (err) {
    console.warn('Clipboard copy failed:', err);
  }
});

// ---------- Online: create/join ----------

document.getElementById('createBtn').addEventListener('click', () => {
  setError('');
  socket.emit('createRoom', (res) => {
    if (!res.ok) {
      setError(res.error || 'Could not create room.');
      return;
    }
    enterRoom(res.code, res.playerNumber, res.token);
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
    enterRoom(res.code, res.playerNumber, res.token);
  });
});

function enterRoom(code, playerNumber, token) {
  mode = 'online';
  roomCode = code;
  myPlayerNumber = playerNumber;
  myToken = token;
  saveActiveRoom(code, token, playerNumber);

  showScreen(roomEl);
  roomCodeEl.textContent = code;
  setRoomStatus(
    playerNumber === 1
      ? 'Waiting for opponent…'
      : 'Connected as Player 2. Waiting for battle to start…',
  );
}

function enterOnlinePlacement() {
  difficultyPickerEl.style.display = 'none';
  showScreen(placementEl);
  placementScreen.enter((placements) => {
    myPlacements = placements;
    socket.emit('submitPlacement', { code: roomCode, placements }, (res) => {
      if (!res.ok) {
        placementStatusEl.textContent = res.error || 'Placement rejected.';
        return;
      }
      if (!res.battleStarted) {
        placementStatusEl.textContent = 'Waiting for opponent to finish placing their fleet…';
      }
    });
  });
}

socket.on('opponentJoined', () => {
  if (mode !== 'online') return;
  enterOnlinePlacement();
});

socket.on('placementStatus', ({ readyPlayerNumber }) => {
  if (mode !== 'online' || placementEl.classList.contains('hidden')) return;
  if (readyPlayerNumber !== myPlayerNumber) {
    placementStatusEl.textContent = 'Opponent is ready. Finish placing your fleet!';
  }
});

socket.on('battleStart', ({ turn, score }) => {
  if (mode !== 'online') return;
  showScreen(battleEl);
  rematchBtn.classList.add('hidden');
  onlineRematchBtn.classList.remove('hidden');
  onlineBattleScreen.start(
    { code: roomCode, playerNumber: myPlayerNumber, placements: myPlacements, turn, score },
    goToMenu,
  );
});

socket.on('shotResult', (data) => {
  if (mode !== 'online') return;
  onlineBattleScreen.handleShotResult(data);
});

socket.on('turnTimeout', (data) => {
  if (mode !== 'online') return;
  onlineBattleScreen.handleTurnTimeout(data);
  showBanner("Turn timed out — it's the other player's turn now.");
  setTimeout(hideBanner, 2500);
});

socket.on('rematchRequested', ({ playerNumber }) => {
  if (mode !== 'online') return;
  onlineBattleScreen.handleRematchRequested(playerNumber);
});

socket.on('rematchStart', () => {
  if (mode !== 'online') return;
  enterOnlinePlacement();
});

// ---------- Disconnect / reconnect / forfeit ----------

socket.on('opponentDisconnected', () => {
  if (mode !== 'online') return;
  showBanner('Opponent disconnected — waiting for them to reconnect…');
});

socket.on('opponentReconnected', () => {
  if (mode !== 'online') return;
  showBanner('Opponent reconnected!');
  setTimeout(hideBanner, 3000);
});

socket.on('opponentLeft', ({ score } = {}) => {
  if (mode !== 'online') return;
  hideBanner();
  if (!battleEl.classList.contains('hidden')) {
    onlineBattleScreen.handleOpponentLeftMidGame(score);
    clearActiveRoom();
  } else {
    goToMenu();
    setError('Opponent left the game.');
  }
});

// ---------- Resume an in-progress room after a page reload ----------

socket.on('connect', () => {
  const saved = loadActiveRoom();
  if (!saved) return;

  socket.emit('rejoinRoom', { code: saved.code, token: saved.token }, (res) => {
    if (!res.ok) {
      clearActiveRoom();
      return;
    }
    mode = 'online';
    roomCode = saved.code;
    myPlayerNumber = res.snapshot.playerNumber;
    myToken = saved.token;
    myPlacements = res.snapshot.myPlacements;

    if (res.snapshot.status === 'battle' || res.snapshot.status === 'finished') {
      showScreen(battleEl);
      rematchBtn.classList.add('hidden');
      onlineRematchBtn.classList.remove('hidden');
      onlineBattleScreen.resume({ code: roomCode, playerNumber: myPlayerNumber, snapshot: res.snapshot }, goToMenu);
    } else if (res.snapshot.status === 'placing' && res.snapshot.ready) {
      showScreen(roomEl);
      roomCodeEl.textContent = roomCode;
      setRoomStatus('Reconnected — waiting for opponent to finish placing their fleet…');
    } else {
      enterOnlinePlacement();
    }

    if (!res.snapshot.opponentConnected && res.snapshot.status !== 'finished') {
      showBanner('Opponent disconnected — waiting for them to reconnect…');
    }
  });
});

function setError(msg) {
  menuErrorEl.textContent = msg;
}
