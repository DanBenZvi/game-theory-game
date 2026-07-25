// Turn-based battle screen: two 10x10 grids (own fleet + enemy fog of
// war), wired to a client-side AI opponent. Firing rules come from
// BattleshipLogic.fireAt so the exact same function can run server-side
// for online mode in step 4.

(function () {
  const L = window.BattleshipLogic;
  const AI = window.BattleshipAI;

  function createBattleScreen({
    ownGridEl,
    enemyGridEl,
    turnIndicatorEl,
    gameOverEl,
    gameOverTitleEl,
    gameOverStatsEl,
    playAgainBtn,
  }) {
    let ownState = null;
    let enemyState = null;
    let ai = null;
    let turn = 'player';
    let gameOver = false;
    let playerShotCount = 0;
    let onExitCallback = null;

    const ownCellEls = [];
    const enemyCellEls = [];

    function buildGrid(container, cellEls, onCellClick) {
      container.innerHTML = '';
      cellEls.length = 0;
      for (let row = 0; row < L.BOARD_SIZE; row++) {
        const rowEls = [];
        for (let col = 0; col < L.BOARD_SIZE; col++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.row = String(row);
          cell.dataset.col = String(col);
          if (onCellClick) {
            cell.addEventListener('click', () => onCellClick(row, col));
          }
          container.appendChild(cell);
          rowEls.push(cell);
        }
        cellEls.push(rowEls);
      }
    }

    function start({ placements, difficulty }, onExit) {
      onExitCallback = onExit || null;
      ownState = L.createBattleState(placements);
      enemyState = L.createBattleState(L.randomPlacement().placements);
      ai = AI.createAI(difficulty);
      turn = 'player';
      gameOver = false;
      playerShotCount = 0;

      buildGrid(ownGridEl, ownCellEls, null);
      buildGrid(enemyGridEl, enemyCellEls, handleEnemyCellClick);

      for (const p of ownState.placements) {
        for (const { row, col } of p.cells) {
          ownCellEls[row][col].classList.add('ship');
        }
      }

      gameOverEl.classList.add('hidden');
      updateTurnIndicator();
    }

    function handleEnemyCellClick(row, col) {
      if (turn !== 'player' || gameOver) return;
      if (enemyState.shots.has(L.cellKey(row, col))) return;

      const result = L.fireAt(enemyState, row, col);
      playerShotCount++;
      applyResult(enemyCellEls, enemyState, row, col, result);

      if (result.allSunk) {
        finishGame('win');
        return;
      }
      turn = 'ai';
      updateTurnIndicator();
      setTimeout(aiTurn, 650);
    }

    function aiTurn() {
      if (gameOver) return;
      const remainingLengths = ownState.placements
        .filter((p) => !L.getShipStatus(ownState, p.id).sunk)
        .map((p) => p.length);

      const { row, col } = ai.chooseShot(remainingLengths);
      const result = L.fireAt(ownState, row, col);
      ai.markResult(row, col, result.status);
      applyResult(ownCellEls, ownState, row, col, result);

      if (result.allSunk) {
        finishGame('lose');
        return;
      }
      turn = 'player';
      updateTurnIndicator();
    }

    function applyResult(cellEls, state, row, col, result) {
      const cell = cellEls[row][col];
      cell.classList.add(result.status === 'miss' ? 'miss' : 'hit');
      if (result.status === 'sunk') {
        const ship = state.placements.find((p) => p.id === result.shipId);
        for (const { row: r, col: c } of ship.cells) {
          cellEls[r][c].classList.remove('hit');
          cellEls[r][c].classList.add('sunk');
        }
      }
    }

    function updateTurnIndicator() {
      if (gameOver) {
        turnIndicatorEl.textContent = '';
        return;
      }
      turnIndicatorEl.textContent = turn === 'player' ? 'Your turn — fire!' : 'Enemy turn…';
      turnIndicatorEl.classList.toggle('enemy-turn', turn === 'ai');
    }

    function finishGame(outcome) {
      gameOver = true;
      updateTurnIndicator();
      gameOverTitleEl.textContent = outcome === 'win' ? 'VICTORY' : 'DEFEAT';
      gameOverTitleEl.classList.toggle('victory', outcome === 'win');
      gameOverTitleEl.classList.toggle('defeat', outcome === 'lose');
      gameOverStatsEl.textContent =
        outcome === 'win'
          ? `You sank the enemy fleet in ${playerShotCount} shots.`
          : 'Your fleet has been destroyed.';
      gameOverEl.classList.remove('hidden');
    }

    playAgainBtn.addEventListener('click', () => {
      if (onExitCallback) onExitCallback();
    });

    return { start };
  }

  window.createBattleScreen = createBattleScreen;
})();
